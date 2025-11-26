import { assertEquals } from "@std/assert"
import { beforeEach, describe, it } from "@std/testing/bdd"
import { GitHubApi } from "../github-api.ts"
import { Environment } from "../environment.ts"
import { SimulateMerge } from "../simulate-merge.ts"
import { PrepareTestModeEnvStepImpl } from "./prepare-testmode-env.ts"
import { mock, when } from "../mock/mock.ts"
import { Git } from "../git.ts"
import { Exec } from "../exec.ts"
import { GitCommitFake } from "../types/git.test.ts"

describe("prepareEnvironmentForTestMode", () => {
  let step: PrepareTestModeEnvStepImpl

  let environment: Environment
  let gitHubApi: GitHubApi
  let simulateMerge: SimulateMerge
  let git: Git
  let exec: Exec

  beforeEach(() => {
    environment = mock()
    gitHubApi = mock()
    simulateMerge = mock()
    git = mock()
    exec = mock()

    step = new PrepareTestModeEnvStepImpl(
      gitHubApi,
      environment,
      simulateMerge,
      git,
      exec,
    )
  })

  it("should return undefined if not running in test mode", async () => {
    when(environment, "isRunningInPullRequest", () => undefined)

    const result = await step.prepareEnvironmentForTestMode({
      owner: "owner",
      repo: "repo",
    })

    assertEquals(result, undefined)
  })

  it("should perform simulated merge on all pull requests in stack, given multiple pull requests in stack, expect to get list of commits made", async () => {
    const givenMergeType: "merge" | "squash" | "rebase" = "merge"

    when(git, "createLocalBranchFromRemote", async () => {})
    when(environment, "getSimulatedMergeType", async () => givenMergeType)
    when(
      environment,
      "isRunningInPullRequest",
      () => ({ baseBranch: "feature-branch-2", targetBranch: "feature-branch-1", prNumber: 30 }),
    )

    const givenTopPullRequestInPRStack = {
      prNumber: 30,
      sourceBranchName: "feature-branch-2",
      targetBranchName: "feature-branch-1",
      title: "merging feature branch 2 into 1",
      description: "feat-branch-2 into 1 description",
    }
    const givenSecondPullRequestInPRStack = {
      prNumber: 29,
      sourceBranchName: "feature-branch-1",
      targetBranchName: "main",
      title: "merging feature branch 1 into main",
      description: "feat-branch-1 into main description",
    }

    when(gitHubApi, "getPullRequestStack", async () => [
      givenTopPullRequestInPRStack,
      givenSecondPullRequestInPRStack,
    ])

    const expectedCommitsCreatedByFirstSimulatedMerge = [
      new GitCommitFake({ sha: "merge commit for merging feature-branch-2 into feature-branch-1" }),
      new GitCommitFake({ sha: "super sweet feature in feature-branch-2" }),
    ]

    const expectedCommitsCreatedBySecondSimulatedMerge = [
      new GitCommitFake({ sha: "merge commit for merging feature-branch-1 into main" }),
      new GitCommitFake({ sha: "super sweet feature in feature-branch-1" }),
    ]

    const expectedCommitsCreatedBySimulatedMerge = [
      expectedCommitsCreatedBySecondSimulatedMerge[0], // newest commit first. like `git log`
      expectedCommitsCreatedBySecondSimulatedMerge[1],

      expectedCommitsCreatedByFirstSimulatedMerge[0],
      expectedCommitsCreatedByFirstSimulatedMerge[1],
    ]

    let simulateMergeCallCount = 0
    const performSimulatedMergeMock = when(simulateMerge, "performSimulation", async () => {
      simulateMergeCallCount++

      if (simulateMergeCallCount === 1) return expectedCommitsCreatedByFirstSimulatedMerge
      return expectedCommitsCreatedBySecondSimulatedMerge
    })

    const result = await step.prepareEnvironmentForTestMode({
      owner: "owner",
      repo: "repo",
    })

    assertEquals(performSimulatedMergeMock.calls.length, 2)

    // Assert that the merge type was passed in.
    assertEquals(performSimulatedMergeMock.calls[0].args[0], givenMergeType)

    // Assert we passed in the correct arguments for the simulated merges
    assertEquals(performSimulatedMergeMock.calls[0].args[1], {
      baseBranch: givenTopPullRequestInPRStack.sourceBranchName,
      targetBranch: givenTopPullRequestInPRStack.targetBranchName,
      pullRequestNumber: givenTopPullRequestInPRStack.prNumber,
      pullRequestTitle: givenTopPullRequestInPRStack.title,
      pullRequestDescription: givenTopPullRequestInPRStack.description,
    })

    assertEquals(performSimulatedMergeMock.calls[1].args[1], {
      baseBranch: givenSecondPullRequestInPRStack.sourceBranchName,
      targetBranch: givenSecondPullRequestInPRStack.targetBranchName,
      pullRequestNumber: givenSecondPullRequestInPRStack.prNumber,
      pullRequestTitle: givenSecondPullRequestInPRStack.title,
      pullRequestDescription: givenSecondPullRequestInPRStack.description,
    })

    assertEquals(result, {
      currentGitBranch: "main",
      commitsCreatedDuringSimulatedMerges: expectedCommitsCreatedBySimulatedMerge,
    })
  })
})
