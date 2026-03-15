import { Git } from "./git.ts"
import { Logger } from "./log.ts"
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
  constructor(private git: Git, private log: Logger) {}

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
    this.log.msg(`Simulate merging pull request #${pullRequestNumber} using '${simulateMergeType}' method...`)

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
    const commitReference = await this.git.getLatestCommitOnBranch({ branch: { ref: targetBranch } })

    await this.prepareForMerge({ baseBranch, targetBranch })

    await this.git.checkoutBranch({ branch: targetBranch, createBranchIfNotExist: false })

    await this.git.merge({ branchToMergeIn: baseBranch, commitTitle, commitMessage, fastForward: "--no-ff" })

    // if commit reference is undefined, it means that the target branch was empty. So, get all commits
    // which will include all the commits that were just created by the merge.
    if (commitReference === undefined) {
      return await this.git.getCommits({ branch: { ref: targetBranch } })
    } else {
      return await this.git.getLatestCommitsSince({ commit: commitReference })
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
    const commitReference = await this.git.getLatestCommitOnBranch({ branch: { ref: targetBranch } })

    await this.prepareForMerge({ baseBranch, targetBranch })

    // GitHub's "Squash and merge" works by:
    //   1. Checking out the target (base) branch
    //   2. Running `git merge --squash <feature-branch>` which stages all changes as one set
    //   3. Creating a single commit with the PR title/message
    // This avoids replaying commits one-by-one (as rebase does), so conflicts that would
    // appear during a rebase do not affect a squash merge.
    await this.git.checkoutBranch({ branch: targetBranch, createBranchIfNotExist: false })
    await this.git.squash({ branchToSquash: baseBranch, commitTitle, commitMessage })

    // if commit reference is undefined, it means that the target branch was empty. So, get all commits
    // which will include all the commits that were just created by the squash.
    if (commitReference === undefined) {
      return await this.git.getCommits({ branch: { ref: targetBranch } })
    } else {
      return await this.git.getLatestCommitsSince({ commit: commitReference })
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
    const commitReference = await this.git.getLatestCommitOnBranch({ branch: { ref: targetBranch } })

    await this.prepareForMerge({ baseBranch, targetBranch })

    await this.git.checkoutBranch({ branch: baseBranch, createBranchIfNotExist: false })
    await this.git.rebase({ branchToRebaseOnto: targetBranch })
    await this.git.checkoutBranch({ branch: targetBranch, createBranchIfNotExist: false })
    await this.git.merge({ branchToMergeIn: baseBranch, commitTitle, commitMessage, fastForward: "--ff-only" })

    // if commit reference is undefined, it means that the target branch was empty. So, get all commits
    // which will include all the commits that were just created by the rebase.
    if (commitReference === undefined) {
      return await this.git.getCommits({ branch: { ref: targetBranch } })
    } else {
      return await this.git.getLatestCommitsSince({ commit: commitReference })
    }
  }

  private async prepareForMerge({ baseBranch, targetBranch }: { baseBranch: string; targetBranch: string }) {
    // First, make sure we have the latest changes from both branches
    await this.git.checkoutBranch({ branch: baseBranch, createBranchIfNotExist: false })
    await this.git.pull()
    await this.git.checkoutBranch({ branch: targetBranch, createBranchIfNotExist: false })
    await this.git.pull()

    // Setup git to be able to create a merge commit
    // The values here do not matter because we are not pushing the changes back to the remote
    await this.git.setUser({ name: "Deployment Test", email: "test@test.com" })
  }
}
