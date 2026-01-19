#!/usr/bin/env -S deno run --quiet --allow-all

// deno-lint-ignore-file no-import-prefix
import { DeployStepInput } from "../lib/types/environment.ts"
import { $ } from "@david/dax"
import { blue } from "npm:yoctocolors@2.1.2"

const input: DeployStepInput = JSON.parse(await Deno.readTextFile(Deno.env.get("DATA_FILE_PATH")!))

console.log(blue(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Compile Deno binaries

Why? 
We want to provide pre-compiled binaries for various platforms so users can easily download and use them without needing to have Deno installed.

How? 
We will compile the Deno script into binaries for the following platforms:
- Linux x86_64
- Linux aarch64
- macOS x86_64
- macOS aarch64

These binaries will be stored in the 'dist' directory and uploaded as assets to the GitHub release.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`))

const githubReleaseAssets: string[] = []

const compileBinary = async ({ denoTarget, outputFileName }: { denoTarget: string; outputFileName: string }) => {
  const result = await $`OUTPUT_FILE_NAME=dist/${outputFileName} DENO_TARGET=${denoTarget} deno task compile`
    .printCommand()
    .noThrow()
    .stdout("piped")
    .stderr("piped")

  if (result.code !== 0) {
    console.error("\n" + result.stderr)
    Deno.exit(1)
  }

  githubReleaseAssets.push(`dist/${outputFileName}#${outputFileName}`)
}

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

console.log(blue(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Update version.txt on 'latest' branch and push to git repository

Why? 
We need to modify the version.txt file, commit it, and push it to our git repository.
We want to make the commit on the 'latest' branch instead of the 'main' branch
so we can keep our 'main' branch clean from these release commits that we make. 

How? 
- Checkout the 'latest' branch
- Merge the current branch ('main') into 'latest'
- Modify version.txt with the new version
- Commit the changes to version.txt
- Push the changes to 'latest' after we make our version.txt commit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`))

const currentBranch = await $`git rev-parse --abbrev-ref HEAD`.text()
// To help with debugging later, print some commits before we checkout to latest branch to tell us what is on this branch for comparison later.
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

// Push the commit
if (input.testMode) {
  console.log(blue(`Test mode is enabled, so skipping git push`))
} else {
  await $`git push`.printCommand()
}

console.log(blue(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pass the compiled binaries to the GitHub release so they are included as assets

Why? 
The compiled binaries need to be uploaded to a server so users can download them. 
We use GitHub releases to host these binaries, attaching them as assets to the release we will create. 

How? 
We run the script, @levibostian/decaf-script-github-releases, with the 'set-github-release-assets' command,
passing in the list of compiled binaries we created earlier. That script will handle uploading the binaries to the GitHub release.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`))

await $`deno ${[
  `run`,
  `--allow-all`,
  `jsr:@levibostian/decaf-script-github-releases@1.1.0`,
  `set-github-release-assets`,
  ...githubReleaseAssets,
]}`.printCommand()

console.log(blue(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create the GitHub Release 

Why? 
When using decaf, we need to update the single-source-of-truth for the latest release that has been made. 
This project uses GitHub Releases to store the single-source-of-truth. So, we need to create a GitHub Release for the new version.

IMPORTANT: This MUST be the last step in this script. After the GitHub Release is created, decaf will consider the release process complete.

How? 
We run the script, @levibostian/decaf-script-github-releases, with the 'set' command. This script will create the GitHub Release for us. 
We pass in a target commit SHA so that the release is associated with the correct code changes we made to the version.txt file.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`))

const latestGitCommitSha = (await $`git rev-parse HEAD`.text()).trim()

await $`deno ${[
  `run`,
  `--allow-all`,
  `jsr:@levibostian/decaf-script-github-releases@1.1.0`,
  `set`,
  `--generate-notes`,
  `--latest`,
  `--target`,
  latestGitCommitSha,
]}`.printCommand()
