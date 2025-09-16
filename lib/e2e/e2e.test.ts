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
import { mock } from "../mock/mock.ts"
import { GitHubApi, overrideGitHubApi } from "../github-api.ts"
import { assertObjectMatch } from "@std/assert"

Deno.test("when running a deployment, given CI only cloned 1 commit on current branch, expect to receive all parsed commits for branch", async () => {
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

  assertEquals(e2eStepScript.getGetLatestReleaseInput().gitCommitsCurrentBranch.length, 2)
  //
  // gitCommitsAllLocalBranches: givenRemoteCommits,
  //gitCommitsCurrentBranch: givenRemoteCommits.get("main")!
})

// helper functions

const setupGitRepo = (
  { checkedOutBranch, localCommits, remoteCommits }: {
    checkedOutBranch: string
    localCommits: Map<string, GitCommit[]>
    remoteCommits: Map<string, GitCommit[]>
  },
): { remoteRepository: GitRemoteRepositoryMock } => {
  currentBranchWhenTestStarts = checkedOutBranch

  const remoteRepository: GitRemoteRepositoryMock = {
    remoteBranches: remoteCommits,
    remoteTags: new Map(),
  }

  overrideGit(new GitStub({ currentBranch: checkedOutBranch, remoteRepo: remoteRepository, commits: localCommits }))

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

  githubApiMock = mock()
  overrideGitHubApi(githubApiMock)

  await import("../../index.ts")
}
