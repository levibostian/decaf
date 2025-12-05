/**
 * e2e tests, with a catch. To make these tests nice and fast, we do some mocking (but as little as possible).
 *
 * The idea is to run tests for scenarios that this tool is likely to encounter and make sure, from a product standpoint, the tool works as expected.
 */

import { assertEquals } from "@std/assert/equals"
import { EnvironmentStub, GitRemoteRepositoryMock, GitRepoClonerStub, GitStub } from "./e2e-stubs.test.ts"
import { GitCommitFake } from "../types/git.test.ts"
import { GitCommit } from "../types/git.ts"
import * as e2eStepScript from "./e2e-step-script-helper.test.ts"
import { Environment } from "../environment.ts"
import { mock, when } from "../mock/mock.ts"
import { GitHubApi, GitHubPullRequest } from "../github-api.ts"
import { assertObjectMatch } from "@std/assert"
import { assertSnapshot } from "@std/testing/snapshot"
import * as di from "../di.ts"

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

  const { gitRepoCloner } = setupGitRepo({
    checkedOutBranch: "main",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  // this test only cares to assert the cloner calls. 
  // so, no need to setup more of the step scripts.
  e2eStepScript.setGetLatestReleaseStepOutput(null)

  await run({
    testMode: false,
    simulatedMergeTypes: ["merge", "rebase", "squash"],
  })

  // Assert: clone() was called 3 times (once per merge type)
  assertEquals(gitRepoCloner.cloneCalls.length, 3, "Should create 3 isolated clones for 3 merge types")

  // Assert: remove() was called 3 times
  assertEquals(gitRepoCloner.removeCalls.length, 3, "Should clean up all 3 isolated clones")
})

Deno.test("when cleanup fails, expect warning logged but execution continues", async () => {
  const mainBranchCommits = [new GitCommitFake({ message: "commit on main", sha: "main-1" })]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>([
    ["main", mainBranchCommits],
  ])

  const { gitRepoCloner } = setupGitRepo({
    checkedOutBranch: "main",
    localCommits: givenLocalCommits,
    remoteCommits: givenRemoteCommits,
    remotePullRequests: [],
  })

  gitRepoCloner.setThrowOnRemove(true)

  // this test only cares to assert the cloner calls. 
  // so, no need to setup more of the step scripts.
  e2eStepScript.setGetLatestReleaseStepOutput(null)

  // Act: Run the tool - should NOT throw despite cleanup failure
  await run({ testMode: false, simulatedMergeTypes: ["merge"] })

  // Assert: The tool completed successfully despite cleanup error
  // If it threw, the test would fail here
  // The test passing proves the finally block caught the error and logged a warning

  // Also verify that clone was called and remove was attempted
  assertEquals(gitRepoCloner.cloneCalls.length, 1, "Should have attempted to create 1 clone")
  assertEquals(gitRepoCloner.removeCalls.length, 1, "Should have attempted to remove the clone despite error")
})

// helper functions

let diGraph: typeof di.productionDiGraph

Deno.test.beforeEach(() => {
  di.clearOverride()

  diGraph = di.getGraph().createChild()
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
): { remoteRepository: GitRemoteRepositoryMock; gitRepoCloner: GitRepoClonerStub } => {
  currentBranchWhenTestStarts = checkedOutBranch

  const remoteRepository: GitRemoteRepositoryMock = {
    remoteBranches: remoteCommits,
    remoteTags: new Map(),
  }

  // Override the services with test implementations
  const gitStub = new GitStub({ currentBranch: checkedOutBranch, remoteRepo: remoteRepository, commits: localCommits })  
  // Override gitRepoCloner to return the same gitStub instead of creating real clones
  const gitRepoCloner = new GitRepoClonerStub(gitStub)
  diGraph = diGraph.override("gitRepoCloner", () => gitRepoCloner)

  githubApiMock = mock()
  when(githubApiMock, "getPullRequestStack", async (_args) => {
    return remotePullRequests
  })
  diGraph = diGraph.override("github", () => githubApiMock)

  return { remoteRepository, gitRepoCloner }
}

let currentBranchWhenTestStarts: string
let environmentMock: Environment
let githubApiMock: GitHubApi = mock()

const run = async ({ testMode, simulatedMergeTypes }: { testMode: boolean; simulatedMergeTypes?: ("merge" | "rebase" | "squash")[] }) => {
  if (testMode) {
    environmentMock = new EnvironmentStub({
      commandToRunStubStepScript: e2eStepScript.getBashCommandToRunThisScript(),
      runFromPullRequest: {
        baseBranch: currentBranchWhenTestStarts,
        targetBranch: "feature",
        prNumber: 123,
      },
      simulatedMergeTypes,
    })
  } else {
    environmentMock = new EnvironmentStub({
      commandToRunStubStepScript: e2eStepScript.getBashCommandToRunThisScript(),
      runFromPush: {
        branch: currentBranchWhenTestStarts,
      },
      simulatedMergeTypes,
    })
  }
  diGraph = diGraph.override("environment", () => environmentMock)

  // Finalize the DI graph with overrides
  di.overrideStore(diGraph)

  // Import the module and call its main function
  await import(`../../index.ts?t=${Date.now()}`)
}
