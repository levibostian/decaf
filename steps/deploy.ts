#!/usr/bin/env -S deno run --quiet --allow-all

import { DeployStepInput } from "../lib/types/environment.ts"
import { build$ } from "@david/dax"

const $ = build$({
  commandBuilder: (builder) => {
    // custom logger to print commands without colors to more easily run assertions in tests. Also, dont mind not using color in prod.
    builder.setPrintCommandLogger((cmd) => {
      console.log(`> ${cmd.toString()}`)
    })
    return builder
  },
})

const input: DeployStepInput = JSON.parse(await Deno.readTextFile(Deno.env.get("DATA_FILE_PATH")!))

const githubReleaseAssets: string[] = []

const compileBinary = async ({ denoTarget, outputFileName }: { denoTarget: string; outputFileName: string }) => {
  await $`OUTPUT_FILE_NAME=dist/${outputFileName} DENO_TARGET=${denoTarget} deno task compile`.printCommand()

  githubReleaseAssets.push(`dist/${outputFileName}#${outputFileName}`)
}

// Do some git setup before we begin to modify files.
// We want to make a git commit to the 'latest' branch, which is a branch that is used to create releases from
// so we can keep our trunk branch clean with commits that we make, not metadata updates like version bumps.
const currentBranch = await $`git rev-parse --abbrev-ref HEAD`.text()
// While on the current branch, print some commits to tell us what is on this branch for comparison later.
await $`git log --oneline -n 5`.printCommand()

// Create local branch from remote if it doesn't exist
// This is necessary because CI performs a shallow clone and doesn't have all branches locally
const branchToCheckout = "latest"
const doesBranchExist = (await $`git branch --list ${branchToCheckout}`.text()).trim() !== ""
if (!doesBranchExist) {
  // Create a tracking branch that tracks origin/latest
  await $`git branch --track ${branchToCheckout} origin/${branchToCheckout}`.printCommand()
}

// checkout the branch where we want the metadata changes to be pushed to.
await $`git checkout ${branchToCheckout}`.printCommand()
// Pull the branch from the remote to ensure we have all commits
// Using --no-rebase to avoid "divergent branches" errors
await $`git pull --no-rebase origin ${branchToCheckout}`.printCommand()
// Merge the previous branch into 'latest', prefer fast-forward but allow merge commit if needed
await $`git merge --ff ${currentBranch}`.printCommand()
// To help with debugging, print some commits to verify we are on the right branch and the merge was successful
await $`git log --oneline -n 5`.printCommand()

await compileBinary({
  denoTarget: "x86_64-unknown-linux-gnu",
  outputFileName: "bin-x86_64-Linux",
})

await compileBinary({
  denoTarget: "aarch64-unknown-linux-gnu",
  outputFileName: "bin-aarch64-Linux",
})

await compileBinary({
  denoTarget: "x86_64-apple-darwin",
  outputFileName: "bin-x86_64-Darwin",
})

await compileBinary({
  denoTarget: "aarch64-apple-darwin",
  outputFileName: "bin-aarch64-Darwin",
})

// Hard-code the version into a file so that when someone pulls a git tag, that code knows what version it is.
// This script is designed to modify a file that no other branch has a chance of modifying. This is opposed to modifying a file such as `action.yml` file.
// This is because we want to prevent merge conflicts whenever we have the `latest` branch modifying a file, but other branch is also modifying that file.
await Deno.writeTextFile("version.txt", input.nextVersionName)

// Commit the changes to version.txt
// Do not throw on error because there is a scenario where we previously made this commit but we failed and retried the deployment.
// This should only fail if there is no change to commit, which is fine.
await $`git add version.txt && git commit -m "Bump version to ${input.nextVersionName}"`.printCommand().noThrow()

console.log(`to help with debugging, log the recently created commit including all the file changes made`)
await $`git show HEAD`.printCommand()

// Push the commit that was made to action.yml
const gitPushArgs = ["push"]
if (input.testMode) {
  gitPushArgs.push("--dry-run")
}
await $`git ${gitPushArgs}`.printCommand()

await $`deno ${[
  `run`,
  `--quiet`,
  `--allow-all`,
  `jsr:@levibostian/decaf-script-github-releases`,
  `set-github-release-assets`,
  ...githubReleaseAssets,
]}`.printCommand()

const latestGitCommitSha = (await $`git rev-parse HEAD`.text()).trim()

await $`deno ${[
  `run`,
  `--quiet`,
  `--allow-all`,
  `jsr:@levibostian/decaf-script-github-releases`,
  `set`,
  `--generate-notes`,
  `--latest`,
  `--target`,
  latestGitCommitSha,
]}`.printCommand()
