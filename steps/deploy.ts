#!/usr/bin/env -S deno run --allow-all

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

// Update the GH_RELEASE_VERSION in the action.yml file with new version
// https://stackoverflow.com/a/22084103
await $`sed -i.bak 's/GH_RELEASE_VERSION=".*"/GH_RELEASE_VERSION="${input.nextVersionName}"/' ./action.yml && rm ./action.yml.bak`

// Commit the changes to action.yml
await $`git add action.yml && git commit -m "Bump version to ${input.nextVersionName}"`.printCommand()

console.log(`to help with debugging, log the recently created commit including all the file changes made`)
await $`git show HEAD`.printCommand()

// if there is a hyphen in the version name, we can assume it's a pre-release version since prod versions do not have hyphens
const isPreRelease = input.nextVersionName.includes("-")
const commandToCreateGithubRelease = `gh release create ${input.nextVersionName} 
  --generate-notes   
  ${isPreRelease ? "--prerelease" : ""}
  --target $(git rev-parse HEAD) 
  ${githubReleaseAssets.join(" ")}`

if (input.testMode) {
  console.log("Running in test mode, skipping creating GitHub release.")
  console.log(`Command to create GitHub release: ${commandToCreateGithubRelease}`)

  Deno.exit(0)
}

// Push the commit that was made to action.yml
await $`git push`.printCommand()

// Create the GitHub release with the compiled binaries
await $`${commandToCreateGithubRelease}`.printCommand()
