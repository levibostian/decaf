import { Exec } from "../exec.ts"
import { Git } from "../git.ts"
import { Environment } from "../environment.ts"
import { GitHubApi } from "../github-api.ts"
import { logger } from "../log.ts"
import { SimulateMerge } from "../simulate-merge.ts"
import { GitCommit } from "../types/git.ts"

export interface PrepareTestModeEnvStep {
  prepareEnvironmentForTestMode({ owner, repo }: {
    owner: string
    repo: string
  }): Promise<{ currentGitBranch: string; commitsCreatedDuringSimulatedMerges: GitCommit[] } | undefined>
}

export class PrepareTestModeEnvStepImpl implements PrepareTestModeEnvStep {
  constructor(
    private githubApi: GitHubApi,
    private environment: Environment,
    private simulateMerge: SimulateMerge,
    private git: Git,
    private exec: Exec,
  ) {}

  prepareEnvironmentForTestMode = async ({ owner, repo }: {
    owner: string
    repo: string
  }): Promise<{ currentGitBranch: string; commitsCreatedDuringSimulatedMerges: GitCommit[] } | undefined> => {
    const testModeContext = this.environment.isRunningInPullRequest()
    const runInTestMode = testModeContext !== undefined

    if (!runInTestMode) return undefined

    const simulateMergeTypes = await this.environment.getSimulatedMergeTypes()
    // Use the first enabled merge type (priority order: merge, squash, rebase)
    const simulateMergeType = simulateMergeTypes[0]
    logger.debug(`Simulated merge types available: ${simulateMergeTypes.join(", ")}. Using: ${simulateMergeType}`)

    const pullRequestStack = await this.githubApi.getPullRequestStack({ owner, repo, startingPrNumber: testModeContext.prNumber })
    const commitsCreatedDuringSimulatedMerges: GitCommit[] = []
    let currentBranch: string = "" // will be set to the last target branch after all simulated merges are done.

    for await (const pr of pullRequestStack) {
      // make sure that a local branch exists for the PR branches so we can check simulate the merge by running merge commands between the branches.
      await this.git.createLocalBranchFromRemote({ exec: this.exec, branch: pr.sourceBranchName })
      await this.git.createLocalBranchFromRemote({ exec: this.exec, branch: pr.targetBranchName })

      const commitsCreated = await this.simulateMerge.performSimulation(simulateMergeType, {
        baseBranch: pr.sourceBranchName,
        targetBranch: pr.targetBranchName,
        pullRequestNumber: pr.prNumber,
        pullRequestTitle: pr.title,
        pullRequestDescription: pr.description,
      })

      commitsCreatedDuringSimulatedMerges.unshift(...commitsCreated)
      currentBranch = pr.targetBranchName // after merging, the branch we are on will be different.
    }

    return { currentGitBranch: currentBranch, commitsCreatedDuringSimulatedMerges }
  }
}
