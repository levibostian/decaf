/**
 * e2e tests, with a catch. To make these tests nice and fast, we do some mocking (but as little as possible).
 *
 * The idea is to run tests for scenarios that this tool is likely to encounter and make sure, from a product standpoint, the tool works as expected.
 */

import { assertEquals } from "@std/assert/equals"
import { EnvironmentStub, GitRemoteRepositoryMock, GitStub } from "./e2e-stubs.test.ts"
import { overrideGit } from "../git.ts"
import { GitCommitFake } from "../types/git.test.ts"
import { GitCommit } from "../types/git.ts"
import * as e2eStepScript from "./e2e-step-script-helper.test.ts"
import { Environment, overrideEnvironment } from "../environment.ts"
import { mock, when } from "../mock/mock.ts"
import { GitHubApi, GitHubPullRequest, overrideGitHubApi } from "../github-api.ts"
import { assertObjectMatch } from "@std/assert"
import { assertSnapshot } from "@std/testing/snapshot"

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

Deno.test("when running in test mode in a stacked pull request, expect the step scripts receive the simulated merge commits", async (t) => {
  // when running on github actions with actions/checkout and it's default config, you will only have 1 checked out commit.
  const mainBranchCommits = [new GitCommitFake({ message: "latest local commit on main branch" })]
  const feature1BranchCommits = [
    ...mainBranchCommits,
    new GitCommitFake({ message: "latest local commit on feature-1 branch" }),
  ]
  const feature2BranchCommits = [
    ...feature1BranchCommits,
    new GitCommitFake({ message: "latest local commit on feature-2 branch" }),
  ]

  const givenLocalCommits = new Map<string, GitCommit[]>([
    ["feature-2", feature2BranchCommits],
  ])

  const givenRemoteCommits = new Map<string, GitCommit[]>(
    [
      ["main", [
        new GitCommitFake({ message: "latest remote commit on main branch" }),
      ]],
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
    gitCurrentBranch: "main",
    testMode: true,
  })

  const commitsReceivedInStep = e2eStepScript.getGetLatestReleaseInput().gitCommitsAllLocalBranches

  await assertSnapshot(t, commitsReceivedInStep)
})

// helper functions

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

  overrideGit(new GitStub({ currentBranch: checkedOutBranch, remoteRepo: remoteRepository, commits: localCommits }))

  githubApiMock = mock()
  when(githubApiMock, "getPullRequestStack", async (_args) => {
    return remotePullRequests
  })
  overrideGitHubApi(githubApiMock)

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
  overrideEnvironment(environmentMock)

  // Force module re-execution by using a unique timestamp parameter
  await import(`../../index.ts?t=${Date.now()}`)
}
