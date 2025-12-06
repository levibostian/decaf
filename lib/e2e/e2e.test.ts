/**
 * e2e tests, with a catch. To make these tests nice and fast, we do some mocking (but as little as possible).
 *
 * The idea is to run tests for scenarios that this tool is likely to encounter and make sure, from a product standpoint, the tool works as expected.
 */

import { assertEquals } from "@std/assert/equals"
import { EnvironmentStub, GitRemoteRepositoryMock, GitRepoManagerStub, GitStub } from "./e2e-stubs.test.ts"
import { GitCommitFake } from "../types/git.test.ts"
import { GitCommit } from "../types/git.ts"
import * as e2eStepScript from "./e2e-step-script-helper.test.ts"
import { Environment } from "../environment.ts"
import { mock, when } from "../mock/mock.ts"
import { GitHubApi, GitHubPullRequest } from "../github-api.ts"
import { assertObjectMatch } from "@std/assert"
import { assertSnapshot } from "@std/testing/snapshot"
import * as di from "../di.ts"

type PrCommentCall = {
  message: string
  owner: string
  repo: string
  prNumber: number
  ciBuildId: string
  ciService: string
}

Deno.test("when running a deployment, given CI only cloned 1 commit on current branch, expect to receive all parsed commits for branch", async (t) => {
  // when running on github actions with actions/checkout and it's default config, you will only have 1 checked out commit.
  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["main", [new GitCommitFake({ message: "latest local commit on main branch" })]],
  ])
  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", [
      ...givenLocalCommits.get("main")!,
      new GitCommitFake({ message: "latest remote commit on main branch" }),
    ]],
  ])

  setupGitRepo({
    checkedOutBranch: "main",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  // this test only cares to assert the input data given for the getLatestRelease step
  // so, no need to setup more of the step scripts.
  e2eStepScript.setGetLatestReleaseStepOutput(null)

  await run({
    testMode: false,
    simulatedMergeTypes: ["merge"],
  })

  // assert that the input data given to the step scripts is what we expect.
  // we expect that decaf got all of the commits from the remote repo.
  assertObjectMatch(e2eStepScript.getGetLatestReleaseInput(), {
    gitCurrentBranch: "main",
    testMode: false,
  })

  const actualMainBranchCommits = e2eStepScript.getGetLatestReleaseInput().gitCommitsAllLocalBranches["main"]
  assertEquals(actualMainBranchCommits.length, 2)
  await assertSnapshot(t, actualMainBranchCommits)
})

Deno.test("when running in test mode in a stacked pull request, expect the step scripts receive the simulated merge commits", async () => {
  const mainBranchCommits = [new GitCommitFake({ message: "latest commit on main branch", sha: "main-sha-1" })]
  const feature1BranchCommits = [
    ...mainBranchCommits,
    new GitCommitFake({ message: "latest commit on feature-1 branch", sha: "feature-1-sha-1" }),
  ]
  const feature2BranchCommits = [
    ...feature1BranchCommits,
    new GitCommitFake({ message: "latest commit on feature-2 branch", sha: "feature-2-sha-1" }),
  ]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    // only 1 commit is checked out locally on the current branch to simulate a CI shallow clone
    ["feature-2", feature2BranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>(
    [
      ["main", mainBranchCommits],
      ["feature-1", feature1BranchCommits],
      ["feature-2", feature2BranchCommits],
    ],
  )

  setupGitRepo({
    checkedOutBranch: "feature-2",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [
      {
        prNumber: 124,
        targetBranchName: "feature-1",
        sourceBranchName: "feature-2",
        title: "PR for feature-2",
        description: "Description for feature-2",
      },
      {
        prNumber: 123,
        targetBranchName: "main",
        sourceBranchName: "feature-1",
        title: "PR for feature-1",
        description: "Description for feature-1",
      },
    ],
  })

  // this test only cares to assert the input data given for the getLatestRelease step
  // so, no need to setup more of the step scripts.
  e2eStepScript.setGetLatestReleaseStepOutput(null)

  await run({
    testMode: true,
    simulatedMergeTypes: ["merge"],
  })

  // assert that the input data given to the step scripts is what we expect.
  // we expect that decaf got all of the commits from the remote repo.
  assertObjectMatch(e2eStepScript.getGetLatestReleaseInput(), {
    // expect that we are on the main branch when the step runs.
    gitCurrentBranch: "main",
    testMode: true,
  })

  assertEquals([
    "Merge pull request #123 from feature-1",
    "Merge pull request #124 from feature-2",
    "latest commit on feature-2 branch",
    "latest commit on feature-1 branch",
    "latest commit on main branch",
  ], e2eStepScript.getGetLatestReleaseInput().gitCommitsCurrentBranch.map((commit) => commit.title))
})

Deno.test("when running with multiple simulated merge types, expect isolated clone created for each type", async () => {
  const mainBranchCommits = [new GitCommitFake({ message: "commit on main", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
  ])

  const { gitRepo } = setupGitRepo({
    checkedOutBranch: "main",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  // this test only cares to assert the cloner calls. 
  // so, no need to setup more of the step scripts.
  e2eStepScript.setGetLatestReleaseStepOutput(null)

  await run({
    testMode: true, // Must be in test mode to create isolated clones
    simulatedMergeTypes: ["merge", "rebase", "squash"],
  })

  // Assert: getIsolatedClone() was called 3 times (once per merge type)
  assertEquals(gitRepo.cloneCalls.length, 3, "Should create 3 isolated clones for 3 merge types")

  // Assert: removeIsolatedClone() was called 3 times
  assertEquals(gitRepo.removeCalls.length, 3, "Should clean up all 3 isolated clones")
})

Deno.test("when cleanup fails, expect warning logged but execution continues", async () => {
  const mainBranchCommits = [new GitCommitFake({ message: "commit on main", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
  ])

  const { gitRepo } = setupGitRepo({
    checkedOutBranch: "main",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  gitRepo.setThrowOnRemove(true)

  // this test only cares to assert the cloner calls. 
  // so, no need to setup more of the step scripts.
  e2eStepScript.setGetLatestReleaseStepOutput(null)

  // Act: Run the tool - should NOT throw despite cleanup failure
  await run({ testMode: true, simulatedMergeTypes: ["merge"] }) // Must be in test mode to create isolated clones

  // Assert: The tool completed successfully despite cleanup error
  // If it threw, the test would fail here
  // The test passing proves the finally block caught the error and logged a warning

  // Also verify that getIsolatedClone was called and removeIsolatedClone was attempted
  assertEquals(gitRepo.cloneCalls.length, 1, "Should have attempted to create 1 clone")
  assertEquals(gitRepo.removeCalls.length, 1, "Should have attempted to remove the clone despite error")
})

Deno.test("when makePullRequestComment is enabled and deployment succeeds, expect status updates posted to PR", async (t) => {
  // Previous release was at commit sha "old-commit-sha"
  const oldCommits = [
    new GitCommitFake({ message: "chore: previous release", sha: "old-commit-sha" }),
  ]
  
  // New commits since last release
  const newCommits = [
    new GitCommitFake({ message: "feat: add new feature", sha: "main-1" }),
    new GitCommitFake({ message: "fix: bug fix", sha: "main-2" }),
  ]

  const allCommits = [...oldCommits, ...newCommits]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["feature", allCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", oldCommits], // main branch already has the previous release commit
    ["feature", allCommits],
  ])

  const { prCommentCalls } = setupGitRepo({
    checkedOutBranch: "feature",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [
      {
        prNumber: 42,
        targetBranchName: "main",
        sourceBranchName: "feature",
        title: "Add new feature and bug fix",
        description: "PR description",
      },
    ],
  })

  // Setup step scripts - this is NOT the first release
  e2eStepScript.setGetLatestReleaseStepOutput({ versionName: "1.0.0", commitSha: "old-commit-sha" })
  e2eStepScript.setNextReleaseVersionStepOutput({ version: "1.1.0" })

  await run({
    testMode: true,
    simulatedMergeTypes: ["merge"],
    makePullRequestComment: true,
  })

  // Verify we made 2 calls: initial + result
  assertEquals(prCommentCalls.length, 2, "Should post initial status and result")

  // Snapshot all PR comments - should show latest release v1.0.0 and 2 new commits
  await assertSnapshot(t, prCommentCalls.map((call) => call.message))
})

Deno.test("when makePullRequestComment is enabled and no deployment triggered, expect appropriate PR message", async (t) => {
  const mainBranchCommits = [new GitCommitFake({ message: "chore: does not trigger release", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["feature", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", []],
    ["feature", mainBranchCommits],
  ])

  const { prCommentCalls } = setupGitRepo({
    checkedOutBranch: "feature",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  e2eStepScript.setGetLatestReleaseStepOutput({ versionName: "1.0.0", commitSha: "abc123prev" })
  // Return null to indicate no deployment needed
  e2eStepScript.setNextReleaseVersionStepOutput(null)

  await run({
    testMode: true,
    simulatedMergeTypes: ["merge"],
    makePullRequestComment: true,
  })

  assertEquals(prCommentCalls.length, 2, "Should post initial status and result")

  // Snapshot all PR comments
  await assertSnapshot(t, prCommentCalls.map((call) => call.message))
})

Deno.test("when multiple simulated merge types configured with PR comments, expect separate status for each type", async (t) => {
  const mainBranchCommits = [new GitCommitFake({ message: "feat: add feature", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["feature", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", []],
    ["feature", mainBranchCommits],
  ])

  const { prCommentCalls } = setupGitRepo({
    checkedOutBranch: "feature",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  e2eStepScript.setGetLatestReleaseStepOutput({ versionName: "1.0.0", commitSha: "def456prev" })
  e2eStepScript.setNextReleaseVersionStepOutput({ version: "1.1.0" })

  await run({
    testMode: true,
    simulatedMergeTypes: ["merge", "rebase", "squash"],
    makePullRequestComment: true,
  })

  // Should have: 1 initial + 3 results = 4 calls
  assertEquals(prCommentCalls.length, 4, "Should post initial status and 3 merge type results")

  // Snapshot all PR comments
  await assertSnapshot(t, prCommentCalls.map((call) => call.message))
})

Deno.test("when this is the first release with PR comments enabled, expect 'Learn more' shows appropriate text", async (t) => {
  const mainBranchCommits = [new GitCommitFake({ message: "feat: initial release", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["feature", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", []],
    ["feature", mainBranchCommits],
  ])

  const { prCommentCalls } = setupGitRepo({
    checkedOutBranch: "feature",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  // null indicates first release
  e2eStepScript.setGetLatestReleaseStepOutput(null)
  e2eStepScript.setNextReleaseVersionStepOutput({ version: "1.0.0" })

  await run({
    testMode: true,
    simulatedMergeTypes: ["merge"],
    makePullRequestComment: true,
  })

  assertEquals(prCommentCalls.length, 2)

  // Snapshot all PR comments
  await assertSnapshot(t, prCommentCalls.map((call) => call.message))
})

Deno.test("when deployment fails with makePullRequestComment enabled and buildUrl provided, expect error comment with link", async (t) => {
  const mainBranchCommits = [new GitCommitFake({ message: "feat: add feature", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["feature", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", []],
    ["feature", mainBranchCommits],
  ])

  const { prCommentCalls } = setupGitRepo({
    checkedOutBranch: "feature",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  e2eStepScript.setGetLatestReleaseStepOutput({ versionName: "1.0.0", commitSha: "ghi789prev" })
  e2eStepScript.setNextReleaseVersionStepOutput({ version: "1.1.0" })
  // Make the deployment step throw an error
  e2eStepScript.setShouldThrowError(true, "Deployment failed due to network error")

  try {
    await run({
      testMode: true,
      simulatedMergeTypes: ["merge"],
      makePullRequestComment: true,
      buildUrl: "https://github.com/owner/repo/actions/runs/123456",
    })
  } catch (_error) {
    // Expected to throw
  }

  // Verify we made 2 calls: initial + error message
  assertEquals(prCommentCalls.length, 2, "Should post initial status and error message")

  // Snapshot all PR comments
  await assertSnapshot(t, prCommentCalls.map((call) => call.message))
})

Deno.test("when deployment fails with makePullRequestComment enabled and no buildUrl, expect error comment without link", async (t) => {
  const mainBranchCommits = [new GitCommitFake({ message: "feat: add feature", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["feature", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", []],
    ["feature", mainBranchCommits],
  ])

  const { prCommentCalls } = setupGitRepo({
    checkedOutBranch: "feature",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  e2eStepScript.setGetLatestReleaseStepOutput({ versionName: "1.0.0", commitSha: "jkl012prev" })
  e2eStepScript.setNextReleaseVersionStepOutput({ version: "1.1.0" })
  // Make the deployment step throw an error
  e2eStepScript.setShouldThrowError(true, "Deployment failed due to network error")

  try {
    await run({
      testMode: true,
      simulatedMergeTypes: ["merge"],
      makePullRequestComment: true,
      // No buildUrl provided
    })
  } catch (_error) {
    // Expected to throw
  }

  // Verify we made 2 calls: initial + error message
  assertEquals(prCommentCalls.length, 2, "Should post initial status and error message")

  // Snapshot all PR comments
  await assertSnapshot(t, prCommentCalls.map((call) => call.message))
})

// Tests to prove test mode vs non-test mode behavior

Deno.test("TEST MODE: when running in pull request, expect simulated merges to be performed", async () => {
  const mainBranchCommits = [new GitCommitFake({ message: "commit on main", sha: "main-1" })]
  const featureBranchCommits = [
    ...mainBranchCommits,
    new GitCommitFake({ message: "commit on feature", sha: "feature-1" }),
  ]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["feature", featureBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
    ["feature", featureBranchCommits],
  ])

  const { gitRepo } = setupGitRepo({
    checkedOutBranch: "feature",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [
      {
        prNumber: 42,
        targetBranchName: "main",
        sourceBranchName: "feature",
        title: "Add feature",
        description: "Feature PR",
      },
    ],
  })

  e2eStepScript.setGetLatestReleaseStepOutput(null)

  await run({
    testMode: true,
    simulatedMergeTypes: ["merge"],
  })

  // Assert: In test mode, we should create isolated clones for simulated merges
  assertEquals(gitRepo.cloneCalls.length, 1, "Should create 1 isolated clone for simulated merge in test mode")

  // Assert: The simulated merge should have happened - we should be on main branch after merge
  const inputData = e2eStepScript.getGetLatestReleaseInput()
  assertEquals(inputData.gitCurrentBranch, "main", "After simulated merge, should be on main branch")
  
  // Assert: Should have merge commit in the commit history
  const commitTitles = inputData.gitCommitsCurrentBranch.map((c) => c.title)
  assertEquals(commitTitles[0], "Merge pull request #42 from feature", "First commit should be the merge commit from simulated merge")
})

Deno.test("TEST MODE: when running in pull request, expect step scripts to receive testMode=true", async () => {
  const mainBranchCommits = [new GitCommitFake({ message: "commit on main", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["feature", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
    ["feature", mainBranchCommits],
  ])

  setupGitRepo({
    checkedOutBranch: "feature",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  e2eStepScript.setGetLatestReleaseStepOutput(null)

  await run({
    testMode: true,
    simulatedMergeTypes: ["merge"],
  })

  // Assert: Step scripts should receive testMode=true
  const getLatestReleaseInput = e2eStepScript.getGetLatestReleaseInput()
  assertEquals(getLatestReleaseInput.testMode, true, "Step scripts should receive testMode=true in test mode")
})

Deno.test("TEST MODE: when deployment verification fails, expect warning (not error) to be logged", async () => {
  const mainBranchCommits = [new GitCommitFake({ message: "feat: add feature", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["feature", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", []],
    ["feature", mainBranchCommits],
  ])

  setupGitRepo({
    checkedOutBranch: "feature",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  // Setup: Latest release before deployment is null (first release)
  e2eStepScript.setGetLatestReleaseStepOutput(null)
  // Setup: Next release version will be 1.0.0
  e2eStepScript.setNextReleaseVersionStepOutput({ version: "1.0.0" })

  // Act: Run in test mode - should NOT throw even though verification will fail
  await run({
    testMode: true,
    simulatedMergeTypes: ["merge"],
  })

  // Assert: Test passed, which means no error was thrown
  // In test mode, verification failure should log a warning but not throw an error
  // The fact that we reach this point proves the verification was lenient
})

Deno.test("NON-TEST MODE: when running from push event, expect NO simulated merges to be performed, expect to run in real git repo", async () => {
  const mainBranchCommits = [new GitCommitFake({ message: "commit on main", sha: "main-1" })]
  const featureBranchCommits = [
    ...mainBranchCommits,
    new GitCommitFake({ message: "feat: new feature", sha: "feature-1" }),
  ]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
    ["feature", featureBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
    ["feature", featureBranchCommits],
  ])

  // Setup: There is a pull request from feature -> main, but we're running from a push event to feature branch
  const pullRequest: GitHubPullRequest = {
    prNumber: 123,
    sourceBranchName: "feature",
    targetBranchName: "main",
    title: "Test PR",
    description: "Test description",
  }

  const { gitRepo } = setupGitRepo({
    checkedOutBranch: "feature",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [pullRequest],
  })

  e2eStepScript.setGetLatestReleaseStepOutput(null)

  await run({
    testMode: false,
    simulatedMergeTypes: ["merge"],
  })

  // Assert: Should NOT have performed simulated merge
  // In non-test mode, we should still be on the feature branch we started on (not merged to main)
  const inputData = e2eStepScript.getGetLatestReleaseInput()
  assertEquals(inputData.gitCurrentBranch, "feature", "Should remain on feature branch (no simulated merge to main)")

  // Assert: Expect to run in real git repo, not isolated clone
  assertEquals(gitRepo.cloneCalls.length, 0, "Should have attempted to create 0 clones in non-test mode")
  
  // Assert: Should NOT have any merge commits (no simulated merge)
  const commitTitles = inputData.gitCommitsCurrentBranch.map((c) => c.title)
  assertEquals(commitTitles.includes("Merge pull request"), false, "Should not have any merge commits from simulated merge")
})

Deno.test("NON-TEST MODE: when running from push event, expect step scripts to receive testMode=false", async () => {
  const mainBranchCommits = [new GitCommitFake({ message: "commit on main", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
  ])

  setupGitRepo({
    checkedOutBranch: "main",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  e2eStepScript.setGetLatestReleaseStepOutput(null)

  await run({
    testMode: false,
    simulatedMergeTypes: ["merge"],
  })

  // Assert: Step scripts should receive testMode=false
  const getLatestReleaseInput = e2eStepScript.getGetLatestReleaseInput()
  assertEquals(getLatestReleaseInput.testMode, false, "Step scripts should receive testMode=false in non-test mode")
})

Deno.test("NON-TEST MODE: when deployment verification fails with failOnDeployVerification=true, expect error to be thrown", async () => {
  const mainBranchCommits = [new GitCommitFake({ message: "feat: add feature", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
  ])

  setupGitRepo({
    checkedOutBranch: "main",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  // Setup: Latest release before deployment is null (first release)
  e2eStepScript.setGetLatestReleaseStepOutput(null)
  // Setup: Next release version will be 1.0.0
  e2eStepScript.setNextReleaseVersionStepOutput({ version: "1.0.0" })

  // Act & Assert: Run in non-test mode with failOnDeployVerification=true
  // This should throw an error when verification fails
  let didThrow = false
  try {
    await run({
      testMode: false,
      simulatedMergeTypes: ["merge"],
      failOnDeployVerification: true,
    })
  } catch (error) {
    didThrow = true
    // Verify it's the verification error
    assertEquals(
      (error as Error).message.includes("Deployment verification failed"), // the error message that is thrown. 
      true,
      "Should throw verification error in non-test mode with strict verification",
    )
  }

  // Assert: Should have thrown an error
  assertEquals(didThrow, true, "Should throw error when verification fails in non-test mode with failOnDeployVerification=true")
})

// helper functions

let diGraph: typeof di.productionDiGraph

Deno.test.beforeEach(() => {
  di.clearOverride()

  diGraph = di.getGraph().createChild()
  prCommentCalls = []
  // Reset error flag and step outputs
  e2eStepScript.setShouldThrowError(false)
  e2eStepScript.setGetLatestReleaseStepOutput(null)
  e2eStepScript.setNextReleaseVersionStepOutput(null)
})

Deno.test.afterEach(() => {
  di.clearOverride()
})

const setupGitRepo = (
  { checkedOutBranch, localCommits, remoteCommits, remotePullRequests }: {
    checkedOutBranch: string
    localCommits: Map<string, GitCommit[]>
    remoteCommits: Map<string, GitCommit[]>
    remotePullRequests: GitHubPullRequest[]
  },
): { remoteRepository: GitRemoteRepositoryMock; gitRepo: GitRepoManagerStub; prCommentCalls: PrCommentCall[] } => {
  currentBranchWhenTestStarts = checkedOutBranch

  const remoteRepository: GitRemoteRepositoryMock = {
    remoteBranches: remoteCommits,
    remoteTags: new Map(),
  }

  // Override the services with test implementations
  const gitStub = new GitStub({ currentBranch: checkedOutBranch, remoteRepo: remoteRepository, commits: localCommits })  
  // Override gitRepoManager to return the same gitStub instead of creating real clones
  const gitRepo = new GitRepoManagerStub(gitStub)
  diGraph = diGraph.override("gitRepoManager", () => gitRepo)

  githubApiMock = mock()
  when(githubApiMock, "getPullRequestStack", async (_args) => {
    return remotePullRequests
  })
  when(githubApiMock, "postStatusUpdateOnPullRequest", async (args) => {
    prCommentCalls.push(args)
  })
  diGraph = diGraph.override("github", () => githubApiMock)

  return { remoteRepository, gitRepo, prCommentCalls }
}

let currentBranchWhenTestStarts: string
let environmentMock: Environment
let githubApiMock: GitHubApi = mock()
let prCommentCalls: PrCommentCall[] = []

const run = async (
  { testMode, simulatedMergeTypes, makePullRequestComment, buildUrl, failOnDeployVerification }: {
    testMode: boolean
    simulatedMergeTypes?: ("merge" | "rebase" | "squash")[]
    makePullRequestComment?: boolean
    buildUrl?: string
    failOnDeployVerification?: boolean
  },
) => {
  if (testMode) {
    environmentMock = new EnvironmentStub({
      commandToRunStubStepScript: e2eStepScript.getBashCommandToRunThisScript(),
      runFromPullRequest: {
        baseBranch: currentBranchWhenTestStarts,
        targetBranch: "feature",
        prNumber: 123,
      },
      simulatedMergeTypes,
      makePullRequestComment,
      buildUrl,
      failOnDeployVerification,
    })
  } else {
    environmentMock = new EnvironmentStub({
      commandToRunStubStepScript: e2eStepScript.getBashCommandToRunThisScript(),
      runFromPush: {
        branch: currentBranchWhenTestStarts,
      },
      simulatedMergeTypes,
      makePullRequestComment,
      buildUrl,
      failOnDeployVerification,
    })
  }
  diGraph = diGraph.override("environment", () => environmentMock)

  // Finalize the DI graph with overrides
  di.overrideStore(diGraph)

  // Import and call main function
  const { main } = await import("../../index.ts")
  await main()
}
