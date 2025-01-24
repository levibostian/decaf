import { assert, assertEquals } from "jsr:@std/assert@1";
import { beforeEach, describe, it } from "jsr:@std/testing@1/bdd";
import { GitHubApi } from "../github-api.ts";
import { GitHubActions } from "../github-actions.ts";
import { SimulateMerge } from "../simulate-merge.ts";
import { PrepareTestModeEnvStepImpl } from "./prepare-testmode-env.ts";
import { mock, when } from "../mock/mock.ts";
import { GitHubCommitFake } from "../github-api.test.ts";

describe("prepareEnvironmentForTestMode", () => {
  let step: PrepareTestModeEnvStepImpl;

  let githubActions: GitHubActions;
  let gitHubApi: GitHubApi
  let simulateMerge: SimulateMerge;
  
  beforeEach(() => {
    githubActions = mock();
    gitHubApi = mock();
    simulateMerge = mock();

    step = new PrepareTestModeEnvStepImpl(
      gitHubApi,
      githubActions,
      simulateMerge,
    );
  })

  it("should return undefined if not running in test mode", async () => {
    when(githubActions, "isRunningInPullRequest", async () => undefined)

    const result = await step.prepareEnvironmentForTestMode({
      owner: "owner",
      repo: "repo",
      startingBranch: "main",
    });

    assertEquals(result, undefined);
  });

  it("should perform simulated merge on all pull requests in stack, given multiple pull requests in stack, expect to get list of commits made", async () => {
    const givenMergeType: 'merge' | 'squash' | 'rebase' = 'merge';

    when(githubActions, "getSimulatedMergeType", () => givenMergeType);
    when(githubActions, "isRunningInPullRequest", async () => ({baseBranch: "feature-branch-2", targetBranch: "feature-branch-1", prTitle: "title", prDescription: "description"}));

    const givenTopPullRequestInPRStack = { prNumber: 30, sourceBranchName: "feature-branch-2", targetBranchName: "feature-branch-1", title: "merging feature branch 2 into 1", description: "feat-branch-2 into 1 description" };
    const givenSecondPullRequestInPRStack = { prNumber: 29, sourceBranchName: "feature-branch-1", targetBranchName: "main", title: "merging feature branch 1 into main", description: "feat-branch-1 into main description" };

    when(gitHubApi, "getPullRequestStack", async () => [
      givenTopPullRequestInPRStack,
      givenSecondPullRequestInPRStack,
    ]);

    const expectedCommitsCreatedByFirstSimulatedMerge = [
      new GitHubCommitFake({sha: "merge commit for merging feature-branch-2 into feature-branch-1"}),
      new GitHubCommitFake({sha: "super sweet feature in feature-branch-2"}), 
    ]

    const expectedCommitsCreatedBySecondSimulatedMerge = [
      new GitHubCommitFake({sha: "merge commit for merging feature-branch-1 into main"}),
      new GitHubCommitFake({sha: "super sweet feature in feature-branch-1"}), 
    ]

    const expectedCommitsCreatedBySimulatedMerge = [      
      expectedCommitsCreatedBySecondSimulatedMerge[0], // newest commit first. like `git log`
      expectedCommitsCreatedBySecondSimulatedMerge[1],

      expectedCommitsCreatedByFirstSimulatedMerge[0],
      expectedCommitsCreatedByFirstSimulatedMerge[1],    
    ]

    let simulateMergeCallCount = 0;
    const performSimulatedMergeMock = when(simulateMerge, "performSimulation", async () => {
      simulateMergeCallCount++;

      if (simulateMergeCallCount === 1) return expectedCommitsCreatedByFirstSimulatedMerge;
      return expectedCommitsCreatedBySecondSimulatedMerge;
    });

    const result = await step.prepareEnvironmentForTestMode({
      owner: "owner",
      repo: "repo",
      startingBranch: "feature-branch-2",
    });

    assertEquals(performSimulatedMergeMock.calls.length, 2);

    // Assert that the merge type was passed in. 
    assertEquals(performSimulatedMergeMock.calls[0].args[0], givenMergeType);

    // Assert we passed in the correct arguments for the simulated merges 
    assertEquals(performSimulatedMergeMock.calls[0].args[1], {
      baseBranch: givenTopPullRequestInPRStack.sourceBranchName,
      targetBranch: givenTopPullRequestInPRStack.targetBranchName,
      commitTitle: givenTopPullRequestInPRStack.title,
      commitMessage: givenTopPullRequestInPRStack.description,
    });

    assertEquals(performSimulatedMergeMock.calls[1].args[1], {
      baseBranch: givenSecondPullRequestInPRStack.sourceBranchName,
      targetBranch: givenSecondPullRequestInPRStack.targetBranchName,
      commitTitle: givenSecondPullRequestInPRStack.title,
      commitMessage: givenSecondPullRequestInPRStack.description,
    });

    assertEquals(result, {
      currentGitBranch: "main",
      commitsCreatedDuringSimulatedMerges: expectedCommitsCreatedBySimulatedMerge,
    });
  });
});



