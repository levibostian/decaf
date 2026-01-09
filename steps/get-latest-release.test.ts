/**
 * automated tests for the steps/get-latest-release.ts file.
 */

// deno-lint-ignore-file no-import-prefix
import { mockBin } from "jsr:@levibostian/mock-a-bin@1.0.0"
import { runGetLatestReleaseScript } from "jsr:@levibostian/decaf-sdk@0.3.0/testing"
import { assertEquals } from "@std/assert"
import { GetLatestReleaseStepInput } from "../lib/types/environment.ts"
import { GitCommit } from "../lib/types/git.ts"
import { assertSnapshot } from "@std/testing/snapshot"

Deno.test("get-latest-release given no releases created, expect exit early without setting any output", async (_t) => {
  await mockBin("gh", "#!/usr/bin/env -S deno run --quiet --allow-all", "console.log('');") // mock gh to return nothing

  const input: GetLatestReleaseStepInput = {} as unknown as GetLatestReleaseStepInput

  const { code, output } = await runGetLatestReleaseScript("deno run --allow-all steps/get-latest-release.ts", input)

  assertEquals(code, 0)
  assertEquals(output, null)
})

Deno.test("get-latest-release given latest release exists but no commits on both branches, expect exit early without setting any output, expect good human readable logs", async (t) => {
  await mockBin("gh", "#!/usr/bin/env -S deno run --quiet --allow-all", "console.log('v1.0.0');") // mock gh to return a release

  // TODO: making these commit objects is too verbose. consider
  const latestBranchCommit: GitCommit = {
    sha: "abc123",
    abbreviatedSha: "abc123",
    title: "Latest branch commit",
    message: "Latest branch commit",
    messageLines: ["Latest branch commit"],
    author: { name: "Test Author", email: "test@example.com" },
    committer: { name: "Test Committer", email: "test@example.com" },
    date: new Date("2025-01-01"),
    filesChanged: [],
    isMergeCommit: false,
    isRevertCommit: false,
    parents: [],
  }

  const currentBranchCommit: GitCommit = {
    sha: "def456",
    abbreviatedSha: "def456",
    title: "Current branch commit",
    message: "Current branch commit",
    messageLines: ["Current branch commit"],
    author: { name: "Test Author", email: "test@example.com" },
    committer: { name: "Test Committer", email: "test@example.com" },
    date: new Date("2025-01-02"),
    filesChanged: [],
    isMergeCommit: false,
    isRevertCommit: false,
    parents: [],
  }

  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test-owner",
    gitRepoName: "test-repo",
    testMode: false,
    gitCommitsCurrentBranch: [currentBranchCommit],
    gitCommitsAllLocalBranches: {
      "latest": [latestBranchCommit],
      "main": [currentBranchCommit],
    },
  }

  const { code, output, stdout } = await runGetLatestReleaseScript("deno run --allow-all steps/get-latest-release.ts", input)

  assertEquals(code, 1)
  assertEquals(output, null)
  assertSnapshot(t, stdout)
})

Deno.test("get-latest-release given latest release exists with matching commits on both branches, expect output with version and commit sha, expect good human readable logs", async (t) => {
  await mockBin("gh", "#!/usr/bin/env -S deno run --quiet --allow-all", "console.log('v1.2.3');") // mock gh to return a release

  const sharedCommit: GitCommit = {
    sha: "shared123",
    abbreviatedSha: "shared12",
    title: "Shared commit",
    message: "Shared commit",
    messageLines: ["Shared commit"],
    author: { name: "Test Author", email: "test@example.com" },
    committer: { name: "Test Committer", email: "test@example.com" },
    date: new Date("2025-01-01"),
    filesChanged: [],
    isMergeCommit: false,
    isRevertCommit: false,
    parents: [],
  }

  const newerCommit: GitCommit = {
    sha: "newer456",
    abbreviatedSha: "newer456",
    title: "Newer commit",
    message: "Newer commit",
    messageLines: ["Newer commit"],
    author: { name: "Test Author", email: "test@example.com" },
    committer: { name: "Test Committer", email: "test@example.com" },
    date: new Date("2025-01-02"),
    filesChanged: [],
    isMergeCommit: false,
    isRevertCommit: false,
    parents: [],
  }

  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test-owner",
    gitRepoName: "test-repo",
    testMode: false,
    gitCommitsCurrentBranch: [newerCommit, sharedCommit],
    gitCommitsAllLocalBranches: {
      "latest": [sharedCommit],
      "main": [newerCommit, sharedCommit],
    },
  }

  const { code, output, stdout } = await runGetLatestReleaseScript("deno run --allow-all steps/get-latest-release.ts", input)

  assertEquals(code, 0)
  assertEquals(output, {
    versionName: "v1.2.3",
    commitSha: "shared123",
  })
  assertSnapshot(t, stdout)
})

Deno.test("get-latest-release given latest branch does not exist, expect exit early without setting any output, expect good human readable logs", async (t) => {
  await mockBin("gh", "#!/usr/bin/env -S deno run --quiet --allow-all", "console.log('v1.0.0');") // mock gh to return a release

  const currentBranchCommit: GitCommit = {
    sha: "current123",
    abbreviatedSha: "current1",
    title: "Current branch commit",
    message: "Current branch commit",
    messageLines: ["Current branch commit"],
    author: { name: "Test Author", email: "test@example.com" },
    committer: { name: "Test Committer", email: "test@example.com" },
    date: new Date("2025-01-01"),
    filesChanged: [],
    isMergeCommit: false,
    isRevertCommit: false,
    parents: [],
  }

  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test-owner",
    gitRepoName: "test-repo",
    testMode: false,
    gitCommitsCurrentBranch: [currentBranchCommit],
    gitCommitsAllLocalBranches: {
      "main": [currentBranchCommit],
      // no 'latest' branch
    },
  }

  const { code, output, stdout } = await runGetLatestReleaseScript("deno run --allow-all steps/get-latest-release.ts", input)

  assertEquals(code, 1)
  assertEquals(output, null)
  assertSnapshot(t, stdout)
})

Deno.test("get-latest-release given multiple commits on both branches, expect first matching commit, expect good human readable logs", async (t) => {
  await mockBin("gh", "#!/usr/bin/env -S deno run --quiet --allow-all", "console.log('v2.0.0');") // mock gh to return a release

  const oldestSharedCommit: GitCommit = {
    sha: "oldest123",
    abbreviatedSha: "oldest12",
    title: "Oldest shared commit",
    message: "Oldest shared commit",
    messageLines: ["Oldest shared commit"],
    author: { name: "Test Author", email: "test@example.com" },
    committer: { name: "Test Committer", email: "test@example.com" },
    date: new Date("2025-01-01"),
    filesChanged: [],
    isMergeCommit: false,
    isRevertCommit: false,
    parents: [],
  }

  const middleSharedCommit: GitCommit = {
    sha: "middle456",
    abbreviatedSha: "middle45",
    title: "Middle shared commit",
    message: "Middle shared commit",
    messageLines: ["Middle shared commit"],
    author: { name: "Test Author", email: "test@example.com" },
    committer: { name: "Test Committer", email: "test@example.com" },
    date: new Date("2025-01-02"),
    filesChanged: [],
    isMergeCommit: false,
    isRevertCommit: false,
    parents: [],
  }

  const newestCommit: GitCommit = {
    sha: "newest789",
    abbreviatedSha: "newest78",
    title: "Newest commit",
    message: "Newest commit",
    messageLines: ["Newest commit"],
    author: { name: "Test Author", email: "test@example.com" },
    committer: { name: "Test Committer", email: "test@example.com" },
    date: new Date("2025-01-03"),
    filesChanged: [],
    isMergeCommit: false,
    isRevertCommit: false,
    parents: [],
  }

  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test-owner",
    gitRepoName: "test-repo",
    testMode: false,
    gitCommitsCurrentBranch: [newestCommit, middleSharedCommit, oldestSharedCommit],
    gitCommitsAllLocalBranches: {
      "latest": [middleSharedCommit, oldestSharedCommit],
      "main": [newestCommit, middleSharedCommit, oldestSharedCommit],
    },
  }

  const { code, output, stdout } = await runGetLatestReleaseScript("deno run --allow-all steps/get-latest-release.ts", input)

  assertEquals(code, 0)
  assertEquals(output, {
    versionName: "v2.0.0",
    commitSha: "middle456", // Should find the first matching commit from latest branch
  })
  assertSnapshot(t, stdout)
})
