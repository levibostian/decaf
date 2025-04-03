import { assertEquals } from "@std/assert"
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd"
import { GitHubApiImpl, GitHubCommit, GitHubRelease } from "./github-api.ts"

export const GitHubReleaseFake: GitHubRelease = {
  tag: {
    name: "1.0.0",
    commit: {
      sha: "abc123",
    },
  },
  name: "v1.0.0",
  created_at: new Date("2021-01-01T00:00:00Z"),
}

export class GitHubCommitFake implements GitHubCommit {
  sha: string
  message: string
  date: Date

  constructor({
    sha = "abc123",
    message = "chore: does not trigger a release",
    date = new Date("2021-01-01T00:00:00Z"),
  }: Partial<GitHubCommit> = {}) {
    this.sha = sha
    this.message = message
    this.date = date
  }
}

/**
 * The tests in this file are meant to be like a playground and not true automated tests.
 * These functions are setup so you can quickly call functions against real github repositories. Great during development.
 *
 * The tests will run as long as the environment variable INPUT_GITHUB_TOKEN is set.
 */

const assertTokenSet = (): boolean => {
  try { // because we may not have permission to access environment variables, wrap in try/catch to make CI config setup easier.
    if (!Deno.env.get("INPUT_GITHUB_TOKEN")) {
      console.log(
        "GitHub token not set (environment variable INPUT_GITHUB_TOKEN). Going to skip running test.",
      )
      return false
    } else {
      return true
    }
  } catch {
    return false
  }
}

describe("getPullRequestStack", () => {
  it("should return null for pull request that does not exist", async () => {
    if (!assertTokenSet()) return

    const actualPRStack = await GitHubApiImpl.getPullRequestStack({
      owner: "levibostian",
      repo: "new-deployment-tool",
      startingBranch: "does-not-exist",
    })

    assertEquals(actualPRStack, null)
  })

  it("should return full stack, in order, given a branch", async () => {
    if (!assertTokenSet()) return

    const actualPRStack = await GitHubApiImpl.getPullRequestStack({
      owner: "levibostian",
      repo: "new-deployment-tool",
      startingBranch: "spr/alpha/00aa0a8b",
    })

    // it will not actually be null. check the stdout when running the test to see the true value.
    assertEquals(actualPRStack, null)
  })
})

describe("getTagsWithGitHubReleases", () => {
  it("should return sorted list of tags that are also releases", async () => {
    if (!assertTokenSet()) return

    let allReleases: GitHubRelease[] = []

    await GitHubApiImpl.getTagsWithGitHubReleases({
      owner: "swiftlang",
      repo: "swift",
      processReleases: async (releases) => {
        allReleases = allReleases.concat(releases)
        return true // continue paging
      },
      numberOfResults: 10, // test that paging works. Expect to receive the combined result of all pages.
    })

    for (const release of allReleases) {
      console.log(
        "Expect to see list of releases, not list of tags. Expect to be sorted",
      )
      console.log(`GitHub release: ${JSON.stringify(release, null, 2)}`)
    }
  })
})

describe("getCommitsForBranch", () => {
  it("should return sorted list of commits", async () => {
    if (!assertTokenSet()) return

    let allCommits: GitHubCommit[] = []

    await GitHubApiImpl.getCommitsForBranch({
      owner: "levibostian",
      repo: "Wendy-iOS",
      branch: "main",
      processCommits: async (commits) => {
        allCommits = allCommits.concat(commits)
        return true // continue paging
      },
    })

    console.log("Expect to see list of commits. Expect to be sorted")
    console.log(`number of commits: ${allCommits.length}`)
    for (const commit of allCommits) {
      console.log(`GitHub commit: ${JSON.stringify(commit, null, 2)}`)
    }
  })
})
