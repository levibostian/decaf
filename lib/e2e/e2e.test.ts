/**
 * e2e tests, with a catch. To make these tests nice and fast, we do some mocking (but as little as possible).
 *
 * The idea is to run tests for scenarios that this tool is likely to encounter and make sure, from a product standpoint, the tool works as expected.
 */

import { assertEquals } from "@std/assert/equals"
import { EnvironmentStub, GitRemoteRepositoryMock, GitStub } from "./e2e-stubs.test.ts"
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
): { remoteRepository: GitRemoteRepositoryMock } => {
  currentBranchWhenTestStarts = checkedOutBranch

  const remoteRepository: GitRemoteRepositoryMock = {
    remoteBranches: remoteCommits,
    remoteTags: new Map(),
  }

  // Override the services with test implementations
  diGraph = diGraph.override("git", () => new GitStub({ currentBranch: checkedOutBranch, remoteRepo: remoteRepository, commits: localCommits }))

  githubApiMock = mock()
  when(githubApiMock, "getPullRequestStack", async (_args) => {
    return remotePullRequests
  })
  diGraph = diGraph.override("github", () => githubApiMock)

  return { remoteRepository }
}

let currentBranchWhenTestStarts: string
let environmentMock: Environment
let githubApiMock: GitHubApi = mock()

const run = async ({ testMode }: { testMode: boolean }) => {
  if (testMode) {
    environmentMock = new EnvironmentStub({
      commandToRunStubStepScript: e2eStepScript.getBashCommandToRunThisScript(),
      runFromPullRequest: {
        baseBranch: currentBranchWhenTestStarts,
        targetBranch: "feature",
        prNumber: 123,
        simulatedMergeType: "merge",
      },
    })
  } else {
    environmentMock = new EnvironmentStub({
      commandToRunStubStepScript: e2eStepScript.getBashCommandToRunThisScript(),
      runFromPush: {
        branch: currentBranchWhenTestStarts,
      },
    })
  }
  diGraph = diGraph.override("environment", () => environmentMock)

  // Finalize the DI graph with overrides
  di.overrideStore(diGraph)

  // Import the module and call its main function
  await import(`../../index.ts?t=${Date.now()}`)
}
