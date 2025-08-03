#!/usr/bin/env -S deno run --allow-all

import { versionBumpForCommitBasedOnConventionalCommit } from "../lib/conventional-commits.ts"
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

// First, parse all commits to determine the version bump for each commit.
const versionBumpsForEachCommit = input.gitCommitsSinceLastRelease.map((commit) => {
  const abbreviatedCommitTitle = commit.title.length > 50 ? commit.title.substring(0, 50) + "..." : commit.title

  const versionBumpForCommit = versionBumpForCommitBasedOnConventionalCommit(commit)

  const logPrefix = `${abbreviatedCommitTitle} (${commit.abbreviatedSha})`
  switch (versionBumpForCommit) {
    case "major":
      logger.message(`${logPrefix} => indicates a major release.`)
      break
    case "minor":
      logger.message(`${logPrefix} => indicates a minor release.`)
      break
    case "patch":
      logger.message(`${logPrefix} => indicates a patch release.`)
      break
    default:
      logger.message(`${logPrefix} => does not indicate a release.`)
      break
  }

  return versionBumpForCommit
}).filter((versionBump) => versionBump !== undefined) as ("patch" | "major" | "minor")[]

// If none of the commits indicate a release should be made, exit early.
if (versionBumpsForEachCommit.length === 0) {
  exit({ nextReleaseVersion: null })
}

interface ConfigOptions {
  branches?: {
    branch_name?: string
    prerelease?: boolean
    version_suffix?: string
  }[]
}

// User passes in config as a JSON string via the CLI. Open to allowing other ways in future.
const config: ConfigOptions = {
  "branches": [
    { "branch_name": "main", "prerelease": false },
    { "branch_name": "beta", "prerelease": true },
    { "branch_name": "alpha", "prerelease": true },
  ],
}

const lastReleaseVersion = input.lastRelease?.versionName
const isNextReleasePrerelease = config?.branches?.find((branch) => branch.branch_name === input.gitCurrentBranch)?.prerelease
const prereleaseVersionSuffix = config?.branches?.find((branch) => branch.branch_name === input.gitCurrentBranch)?.version_suffix ||
  input.gitCurrentBranch

// If there was not a last release version, then this is the first release. Return a version to start with.
if (!lastReleaseVersion) {
  if (isNextReleasePrerelease) exit({ nextReleaseVersion: `1.0.0-${prereleaseVersionSuffix}.1` })
  else exit({ nextReleaseVersion: "1.0.0" })
}

const lastReleaseSemanticVersion = semver.tryParse(lastReleaseVersion)
if (!lastReleaseSemanticVersion) {
  throw new Error(
    `The last release version, ${lastReleaseVersion}, is not a valid semantic version (https://semver.org/). I can only determine the next release version if the latest release is a valid semantic version. Push a new valid version and try again.`,
  )
}

// return the next release version based on the type of bump indicated by the commits. Prioritize major, then minor, then patch.
let nextReleaseBump: "major" | "minor" | "patch" | null = null
if (versionBumpsForEachCommit.includes("major")) {
  nextReleaseBump = "major"
} else if (versionBumpsForEachCommit.includes("minor")) {
  nextReleaseBump = "minor"
} else if (versionBumpsForEachCommit.includes("patch")) {
  nextReleaseBump = "patch"
}

if (!nextReleaseBump) {
  exit({ nextReleaseVersion: null })
}

// Code to get the next semantic version for a given bump type.
// Code is heavily inspired by semantic-release's implementation to get the next version.
// https://github.com/semantic-release/semantic-release/blob/45bf9d601591bf7649926e54a9459c643136b485/lib/get-next-version.js
// the unit tests for this file is the best reference to understand this code.
if (isNextReleasePrerelease) {
  const isLatestReleaseSameSuffix = lastReleaseSemanticVersion.prerelease && lastReleaseSemanticVersion.prerelease.length > 0 &&
    lastReleaseSemanticVersion.prerelease[0] === prereleaseVersionSuffix

  // If there is the same suffix, we have 2 use cases to handle.
  // 1. Given 1.1.0-beta.2 and bump is minor or patch, we should increment the prerelease version to 1.1.0-beta.3
  // 2. Given 1.1.0-beta.2 and bump is major, we should increment the major version to 2.0.0-beta.1
  if (isLatestReleaseSameSuffix) {
    // Generate both of these use cases and return the greater version which resolves the conflict.
    const version1 = semver.increment(lastReleaseSemanticVersion, "prerelease")
    const version2 = semver.parse(`${semver.format(semver.increment(lastReleaseSemanticVersion, nextReleaseBump))}-${prereleaseVersionSuffix}.1`)

    exit({ nextReleaseVersion: semver.format(semver.greaterThan(version1, version2) ? version1 : version2) })
  } else {
    // if the suffix changes, we perform the version bump, add new suffix, and reset the prerelease version to 1.
    exit({ nextReleaseVersion: `${semver.format(semver.increment(lastReleaseSemanticVersion, nextReleaseBump))}-${prereleaseVersionSuffix}.1` })
  }
} else {
  exit({ nextReleaseVersion: semver.format(semver.increment(lastReleaseSemanticVersion, nextReleaseBump)) })
}
