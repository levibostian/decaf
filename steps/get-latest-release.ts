#!/usr/bin/env -S deno run --allow-all

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

const latestReleaseTagName = await $`gh release list --exclude-drafts --order desc --json name,isLatest,isPrerelease,tagName --jq '.[0].tagName'`
  .text()
const commitSha = await $`gh release view ${latestReleaseTagName} --json name,tagName,targetCommitish --jq '.targetCommitish'`.text()

const output: GetLatestReleaseStepOutput = {
  versionName: latestReleaseTagName,
  commitSha,
}

await Deno.writeTextFile(Deno.env.get("DATA_FILE_PATH")!, JSON.stringify(output))
