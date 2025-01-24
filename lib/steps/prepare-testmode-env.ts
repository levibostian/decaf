import { GitHubActions } from "../github-actions.ts";
import { GitHubApi, GitHubCommit } from "../github-api.ts";
import { SimulateMerge } from "../simulate-merge.ts";

export interface PrepareTestModeEnvStep {
  prepareEnvironmentForTestMode({ owner, repo, startingBranch }: {
    owner: string;
    repo: string;
    startingBranch: string;
  }): Promise<{ currentGitBranch: string, commitsCreatedDuringSimulatedMerges: GitHubCommit[] } | undefined>;
}

export class PrepareTestModeEnvStepImpl implements PrepareTestModeEnvStep {
  constructor(private githubApi: GitHubApi, private githubActions: GitHubActions, private simulateMerge: SimulateMerge) {}

  prepareEnvironmentForTestMode = async ({ owner, repo, startingBranch }: {
    owner: string;
    repo: string;
    startingBranch: string;
  }): Promise<{ currentGitBranch: string, commitsCreatedDuringSimulatedMerges: GitHubCommit[] } | undefined> => {
    const testModeContext = await this.githubActions.isRunningInPullRequest()
    const runInTestMode = testModeContext !== undefined;
    let currentBranch = startingBranch;

    if (!runInTestMode) return undefined

    const simulateMergeType = this.githubActions.getSimulatedMergeType();
  
    const pullRequestStack = await this.githubApi.getPullRequestStack({owner, repo, startingBranch});
    const commitsCreatedDuringSimulatedMerges: GitHubCommit[] = [];
    
    for await (const pr of pullRequestStack) {
        const commitsCreated = await this.simulateMerge.performSimulation(simulateMergeType, {baseBranch: pr.sourceBranchName, targetBranch: pr.targetBranchName, commitTitle: pr.title, commitMessage: pr.description});

        commitsCreatedDuringSimulatedMerges.unshift(...commitsCreated);
        currentBranch = pr.targetBranchName // after merging, the branch we are on will be different. 
      }

    return { currentGitBranch: currentBranch, commitsCreatedDuringSimulatedMerges };
  }
}
