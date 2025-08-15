import { Exec } from "./exec.ts"
import { Git } from "./git.ts"
import { GitHubCommit } from "./github-api.ts"
import { GitCommit } from "./types/git.ts"

export interface SimulateMerge {
  /**
   * @returns a list of commits that were created during the simulated merge.
   */
  performSimulation(
    type: "merge" | "rebase" | "squash",
    { baseBranch, targetBranch, pullRequestNumber, pullRequestTitle, pullRequestDescription }: {
      baseBranch: string
      targetBranch: string
      pullRequestNumber: number
      pullRequestTitle: string
      pullRequestDescription: string
    },
  ): Promise<GitCommit[]>
  merge: (
    { baseBranch, targetBranch, commitTitle, commitMessage }: {
      baseBranch: string
      targetBranch: string
      commitTitle: string
      commitMessage: string
    },
  ) => Promise<GitCommit[]>
  squash: (
    { baseBranch, targetBranch, commitTitle, commitMessage }: {
      baseBranch: string
      targetBranch: string
      commitTitle: string
      commitMessage: string
    },
  ) => Promise<GitCommit[]>
  rebase: (
    { baseBranch, targetBranch, commitTitle, commitMessage }: {
      baseBranch: string
      targetBranch: string
      commitTitle: string
      commitMessage: string
    },
  ) => Promise<GitCommit[]>
}

export class SimulateMergeImpl implements SimulateMerge {
  constructor(private git: Git, private exec: Exec) {}

  performSimulation(
    simulateMergeType: "merge" | "rebase" | "squash",
    { baseBranch, targetBranch, pullRequestNumber, pullRequestTitle, pullRequestDescription }: {
      baseBranch: string
      targetBranch: string
      pullRequestNumber: number
      pullRequestTitle: string
      pullRequestDescription: string
    },
  ) {
    switch (simulateMergeType) {
      case "merge":
        return this.merge({ baseBranch, targetBranch, commitTitle: `Merge pull request #${pullRequestNumber} from ${baseBranch}`, commitMessage: "" })
      case "rebase":
        return this.rebase({ baseBranch, targetBranch, commitTitle: pullRequestTitle, commitMessage: pullRequestDescription })
      case "squash":
        return this.squash({ baseBranch, targetBranch, commitTitle: pullRequestTitle, commitMessage: pullRequestDescription })
    }
  }

  // Perform a merge, including creating a merge commit
  async merge(
    { baseBranch, targetBranch, commitTitle, commitMessage }: {
      baseBranch: string
      targetBranch: string
      commitTitle: string
      commitMessage: string
    },
  ) {
    const commitReference = await this.git.getLatestCommitOnBranch({ exec: this.exec, branch: targetBranch })

    await this.prepareForMerge({ baseBranch, targetBranch })

    await this.git.checkoutBranch({ exec: this.exec, branch: targetBranch, createBranchIfNotExist: false })

    await this.git.merge({ exec: this.exec, branchToMergeIn: baseBranch, commitTitle, commitMessage, fastForward: "--no-ff" })

    // if commit reference is undefined, it means that the target branch was empty. So, get all commits
    // which will include all the commits that were just created by the merge.
    if (commitReference === undefined) {
      return await this.git.getCommits({ exec: this.exec, branch: targetBranch })
    } else {
      return await this.git.getLatestCommitsSince({ exec: this.exec, commit: commitReference })
    }
  }

  async squash(
    { baseBranch, targetBranch, commitTitle, commitMessage }: {
      baseBranch: string
      targetBranch: string
      commitTitle: string
      commitMessage: string
    },
  ) {
    const commitReference = await this.git.getLatestCommitOnBranch({ exec: this.exec, branch: targetBranch })

    await this.prepareForMerge({ baseBranch, targetBranch })

    await this.git.checkoutBranch({ exec: this.exec, branch: baseBranch, createBranchIfNotExist: false })

    // perform a rebase to make sure that the squash we perform will only have commits for this branch.
    // if baseBranch, for example, contains a merge commit, if we do not rebase, that merge commit's changes will be included in the squash.
    // this may revert changes that the target branch has made.
    await this.git.rebase({ exec: this.exec, branchToRebaseOnto: targetBranch })

    // Squash all commits in PR into 1 commit.
    await this.git.squash({ exec: this.exec, branchToSquash: baseBranch, branchMergingInto: targetBranch, commitTitle, commitMessage })

    // we want to merge the squashed commit into the target branch.
    await this.git.checkoutBranch({ exec: this.exec, branch: targetBranch, createBranchIfNotExist: false })
    await this.git.merge({ exec: this.exec, branchToMergeIn: baseBranch, commitTitle, commitMessage, fastForward: "--ff-only" })

    // if commit reference is undefined, it means that the target branch was empty. So, get all commits
    // which will include all the commits that were just created by the squash.
    if (commitReference === undefined) {
      return await this.git.getCommits({ exec: this.exec, branch: targetBranch })
    } else {
      return await this.git.getLatestCommitsSince({ exec: this.exec, commit: commitReference })
    }
  }

  // Perform a rebase without creating a merge commit
  async rebase(
    { baseBranch, targetBranch, commitTitle, commitMessage }: {
      baseBranch: string
      targetBranch: string
      commitTitle: string
      commitMessage: string
    },
  ) {
    const commitReference = await this.git.getLatestCommitOnBranch({ exec: this.exec, branch: targetBranch })

    await this.prepareForMerge({ baseBranch, targetBranch })

    await this.git.checkoutBranch({ exec: this.exec, branch: baseBranch, createBranchIfNotExist: false })
    await this.git.rebase({ exec: this.exec, branchToRebaseOnto: targetBranch })
    await this.git.checkoutBranch({ exec: this.exec, branch: targetBranch, createBranchIfNotExist: false })
    await this.git.merge({ exec: this.exec, branchToMergeIn: baseBranch, commitTitle, commitMessage, fastForward: "--ff-only" })

    // if commit reference is undefined, it means that the target branch was empty. So, get all commits
    // which will include all the commits that were just created by the rebase.
    if (commitReference === undefined) {
      return await this.git.getCommits({ exec: this.exec, branch: targetBranch })
    } else {
      return await this.git.getLatestCommitsSince({ exec: this.exec, commit: commitReference })
    }
  }

  private async prepareForMerge({ baseBranch, targetBranch }: { baseBranch: string; targetBranch: string }) {
    // First, make sure we have the latest changes from both branches
    await this.git.checkoutBranch({ exec: this.exec, branch: baseBranch, createBranchIfNotExist: false })
    await this.git.pull({ exec: this.exec })
    await this.git.checkoutBranch({ exec: this.exec, branch: targetBranch, createBranchIfNotExist: false })
    await this.git.pull({ exec: this.exec })

    // Setup git to be able to create a merge commit
    // The values here do not matter because we are not pushing the changes back to the remote
    await this.git.setUser({ exec: this.exec, name: "Deployment Test", email: "test@test.com" })
  }
}
