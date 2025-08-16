#!/usr/bin/env -S deno run --allow-all

import { GetNextReleaseVersionStepInput } from "../lib/types/environment.ts"
import * as semver from "@std/semver"
import { logger } from "../lib/log.ts"

const input: GetNextReleaseVersionStepInput = JSON.parse(await Deno.readTextFile(Deno.env.get("DATA_FILE_PATH")!))

function exit({ nextReleaseVersion }: { nextReleaseVersion: string | null }): never {
  // Write output as JSON to the same file, if a latest release was found.
  // Otherwise leave it and the deployment tool will know that there is no release to deploy.
  if (nextReleaseVersion !== null) {
    Deno.writeTextFileSync(Deno.env.get("DATA_FILE_PATH")!, JSON.stringify({ version: nextReleaseVersion }))
  }

  Deno.exit(0)
}

/**
 * This script determines the next release version based on the commits made since the last release.
 * It analyzes the commit messages to determine the type of release (major, minor, patch)
 * and increments the version accordingly.
 *
 * For pre-release code (before 1.0.0), it will return 0.1.0 as the first release version and increment
 * from there. This script used to use 1.0.0-alpha.1 type of versioning, but...
 * 1. this script was more complex then it needed to be, especially because the semver library had different
 *    opinions on how to increment pre-release versions.
 * 2. teams I have been on in the past have had opinions or confusion when using the -alpha.1, -beta.1, etc. versions.
 * 3. the semantic versioning spec is loose on how to handle -alpha, -beta, etc. versions and it does suggest
 *    to use 0.1.0 as the first release version and you can make breaking changes until 1.0.0 is released.
 */

const lastReleaseVersion = input.lastRelease?.versionName
if (!lastReleaseVersion) {
  logger.debug("No last release found, returning first release version.")

  exit({ nextReleaseVersion: "0.1.0" })
}

const lastReleaseSemanticVersion = semver.tryParse(lastReleaseVersion)!

// Parse all commits to determine the version bump for each commit.
const versionBumpsForEachCommit: ("major" | "minor" | "patch")[] = input.gitCommitsSinceLastRelease.map((commit) => {
  const abbreviatedCommitTitle = commit.title.length > 50 ? commit.title.substring(0, 50) + "..." : commit.title

  if (/.*!:.*/.test(abbreviatedCommitTitle)) {
    logger.message(`${abbreviatedCommitTitle} => indicates a major release.`)
    return "major"
  } else if (abbreviatedCommitTitle.startsWith("feat:")) {
    logger.message(`${abbreviatedCommitTitle} => indicates a minor release.`)
    return "minor"
  } else if (abbreviatedCommitTitle.startsWith("fix:")) {
    logger.message(`${abbreviatedCommitTitle} => indicates a patch release.`)
    return "patch"
  } else {
    logger.message(`${abbreviatedCommitTitle} => does not indicate a release.`)
    return undefined
  }
})
  .filter((versionBump) => versionBump !== undefined)
  // Sort the version bumps by priority: major > minor > patch
  .sort((a, b) => {
    const priority = { "major": 0, "minor": 1, "patch": 2 }
    return priority[a] - priority[b]
  })
const nextReleaseBump = versionBumpsForEachCommit[0] // highest priority bump, since the list is sorted

if (versionBumpsForEachCommit.length === 0) {
  logger.message(`No commits indicate a release should be made. Exiting without a new release version.`)
  exit({ nextReleaseVersion: null })
}

const nextReleaseVersion = semver.format(semver.increment(lastReleaseSemanticVersion, nextReleaseBump))
exit({ nextReleaseVersion })
