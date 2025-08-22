#!/usr/bin/env -S deno run --quiet --allow-all

import { DeployStepInput } from "../lib/types/environment.ts"
import $ from "@david/dax"

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
// checkout the branch where we want the metadata changes to be pushed to.
await $`git checkout latest`.printCommand()
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

const latestGitCommitSha = (await $`git rev-parse HEAD`.text()).trim()

const argsToCreateGithubRelease = [
  `release`,
  `create`,
  input.nextVersionName,
  `--generate-notes`,
  `--latest`,
  `--target`,
  latestGitCommitSha,
  ...githubReleaseAssets,
]

if (input.testMode) {
  console.log("Running in test mode, skipping creating GitHub release.")
  console.log(`Command to create GitHub release: gh ${argsToCreateGithubRelease.join(" ")}`)

  Deno.exit(0)
}

// Push the commit that was made to action.yml
await $`git push`.printCommand()

// Create the GitHub release with the compiled binaries
// https://github.com/dsherret/dax#providing-arguments-to-a-command
await $`gh ${argsToCreateGithubRelease}`.printCommand()
