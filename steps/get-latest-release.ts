#!/usr/bin/env -S deno run --quiet --allow-all

/**
 * This script retrieves the latest release of the project.
 *
 * This is a very simple script only because of how simple the project's release process is.
 * All release tags are created off of a commit made on the branch 'latest'. Because of this,
 * we just need to ask github for the latest release and that's it.
 *
 * Testing:
 * Assuming that you have `gh` cli installed and authenticated, you can run this script directly.
 * `DATA_FILE_PATH="/tmp/foo.txt" ./steps/get-latest-release.ts && cat /tmp/foo.txt`
 */

import { GetLatestReleaseStepOutput } from "../lib/steps/types/output.ts"
import $ from "@david/dax"
import { GetLatestReleaseStepInput } from "../lib/types/environment.ts"

const input: GetLatestReleaseStepInput = JSON.parse(await Deno.readTextFile(Deno.env.get("DATA_FILE_PATH")!))

// First, get the latest release version.
const latestReleaseVersionName = await $`gh release list --exclude-drafts --order desc --json name,isLatest,isPrerelease,tagName --jq '.[0].name'`
  .text()

if (latestReleaseVersionName.trim() === "") {
  Deno.exit(0) // No releases found, exit early without writing output.
}

// Next, get the commit of the latest release. We can't get this from the 'latest' branch because it points to the metadata commit of the latest release, which is not present in the development branch that we are checked out to. Instead, we find the latest commit that is present on both branches.

const commitsForLatestBranch = input.gitCommitsAllLocalBranches["latest"] || []
const commitsForCurrentBranch = input.gitCommitsCurrentBranch

const latestCommitOnBothBranches = commitsForLatestBranch.find((commit) =>
  commitsForCurrentBranch.some((currentCommit) => currentCommit.sha === commit.sha)
)

if (!latestCommitOnBothBranches) {
  console.log("No commits found that are present on both 'latest' and current branch.")
  console.log("This shouldn't happen, so exiting early with error to avoid creating a broken release.")
  Deno.exit(1) // No commits found that are present on both branches, exit early without writing output.
}

const output: GetLatestReleaseStepOutput = {
  versionName: latestReleaseVersionName,
  commitSha: latestCommitOnBothBranches.sha,
}

await Deno.writeTextFile(Deno.env.get("DATA_FILE_PATH")!, JSON.stringify(output))
