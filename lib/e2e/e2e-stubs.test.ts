import { Exec } from "../exec.ts"
import { Git } from "../git.ts"
import { GitCommit } from "../types/git.ts"
import { Environment } from "../environment.ts"
import { AnyStepName } from "../steps/types/any-step.ts"

export interface GitRemoteRepositoryMock {
  /** Simulates remote branches available for fetching */
  remoteBranches: Map<string, GitCommit[]>
  /** Simulates remote tags available for fetching */
  remoteTags: Map<string, string> // tag name -> commit SHA
}

export class GitStub implements Git {
  currentBranch: string
  /** Local commits for all local branches. These are commits that are pulled/merge into branches, not commits that are fetched! */
  localBranchCommits: Map<string, GitCommit[]>
  /** Commits that have been fetched, but might not be merged into a branch.
   * You can view these commits with 'git log' if you use the correct ref like 'origin/foo'. We do merge commits into local branches for simulated merges.
   */
  commitsFetched: Map<string, GitCommit[]>
  /** Local tags */
  tags: Map<string, string>
  /** All branches (local and remote). If it's remote, the name will be prefixed with 'origin/' */
  branches: string[]
  /** Mock remote repository state */
  remoteRepo: GitRemoteRepositoryMock
  /** Whether the repository is in a shallow state */
  isShallow: boolean

  constructor(
    { currentBranch, remoteRepo, commits }: { currentBranch: string; remoteRepo: GitRemoteRepositoryMock; commits: Map<string, GitCommit[]> },
  ) {
    this.currentBranch = currentBranch
    this.localBranchCommits = commits
    this.tags = new Map()
    this.branches = []
    this.branches.push(currentBranch)
    this.commitsFetched = new Map()
    this.isShallow = true // Start as shallow repository
    this.remoteRepo = remoteRepo

    // Initialize commitsFetched to only contain the local commits initially
    // After fetch() is called, this will be populated with complete remote history
    for (const [branchName, branchCommits] of commits) {
      this.commitsFetched.set(branchName, [...branchCommits])
    }
  }

  /** Generate a random SHA-like string for mock commits */
  private generateSha(): string {
    return Math.random().toString(16).substring(2, 42).padEnd(40, "0")
  }

  fetch: () => Promise<void> = async () => {
    // Simulate fetching from remote repository
    // This converts a shallow repository to unshallow by adding remote commits and tags

    // Add remote branches to list of branches so that we can use 'git log' to view those commits.
    for (const [branchName, commits] of this.remoteRepo.remoteBranches) {
      const remoteBranchRef = `origin/${branchName}`

      if (!this.branches.includes(remoteBranchRef)) {
        this.branches.push(remoteBranchRef)
      }

      // Store remote commits under the origin/ ref
      this.commitsFetched.set(remoteBranchRef, [...commits])

      // After fetch, local branches can see all commits with 'git log'.
      // This simulates how 'git log main' shows full history after 'git fetch --unshallow'
      // even though the local branch pointer hasn't moved.
      const localBranchName = branchName
      if (this.branches.includes(localBranchName)) {
        this.commitsFetched.set(localBranchName, commits)
      }
    }

    // Add remote tags
    for (const [tagName, commitSha] of this.remoteRepo.remoteTags) {
      this.tags.set(tagName, commitSha)
    }

    // Repository is no longer shallow after fetch
    this.isShallow = false

    return Promise.resolve()
  }
  checkoutBranch: ({ exec, branch, createBranchIfNotExist }: { exec: Exec; branch: string; createBranchIfNotExist: boolean }) => Promise<void> =
    async ({ branch, createBranchIfNotExist }) => {
      // Check if branch exists locally or remotely
      const branchExists = this.localBranchCommits.has(branch) || this.branches.includes(branch)

      if (!branchExists && !createBranchIfNotExist) {
        throw new Error(`Branch '${branch}' does not exist and createBranchIfNotExist is false`)
      }

      if (!branchExists && createBranchIfNotExist) {
        // Create new branch from current branch
        const currentBranchCommits = this.localBranchCommits.get(this.currentBranch) || []
        this.localBranchCommits.set(branch, [...currentBranchCommits]) // Copy commits from current branch
        this.branches.push(branch)
      }

      // If branch exists remotely but not locally, create local tracking branch
      if (!this.localBranchCommits.has(branch) && this.branches.includes(branch)) {
        const branchRef = branch
        if (branchRef.startsWith("origin/")) {
          const remoteBranchName = branchRef.replace("origin/", "")
          const remoteCommits = this.remoteRepo.remoteBranches.get(remoteBranchName) || []
          this.localBranchCommits.set(branch, [...remoteCommits])
        }
      }

      this.currentBranch = branch
      return Promise.resolve()
    }

  merge: (
    { exec, branchToMergeIn, commitTitle, commitMessage, fastForward }: {
      exec: Exec
      branchToMergeIn: string
      commitTitle: string
      commitMessage: string
      fastForward?: "--no-ff" | "--ff-only"
    },
  ) => Promise<void> = async ({ branchToMergeIn, commitTitle, commitMessage, fastForward }) => {
    const currentBranchCommits = this.localBranchCommits.get(this.currentBranch) || []
    const branchToMergeCommits = this.localBranchCommits.get(branchToMergeIn) || []

    if (branchToMergeCommits.length === 0) {
      throw new Error(`Branch '${branchToMergeIn}' has no commits or does not exist`)
    }

    // Check if fast-forward is possible (current branch is behind the branch to merge)
    const canFastForward = currentBranchCommits.length === 0 ||
      branchToMergeCommits.some((commit) => currentBranchCommits[currentBranchCommits.length - 1]?.sha === commit.sha)

    if (fastForward === "--ff-only" && !canFastForward) {
      throw new Error("Cannot fast-forward merge - branches have diverged")
    }

    let updatedCommits: GitCommit[]

    if (fastForward !== "--no-ff" && canFastForward) {
      // Fast-forward merge: just add the new commits
      const newCommits = branchToMergeCommits.filter((commit) => !currentBranchCommits.some((existing) => existing.sha === commit.sha))
      updatedCommits = [...currentBranchCommits, ...newCommits]
    } else {
      // Create merge commit
      const mergeCommit: GitCommit = {
        title: commitTitle,
        sha: this.generateSha(),
        abbreviatedSha: this.generateSha().substring(0, 8),
        message: `${commitTitle}\n\n${commitMessage}`,
        messageLines: [commitTitle, "", commitMessage],
        author: { name: "Test User", email: "test@example.com" },
        committer: { name: "Test User", email: "test@example.com" },
        date: new Date(),
        filesChanged: [], // TODO: Could implement file tracking if needed
        isMergeCommit: true,
        isRevertCommit: false,
        parents: [
          currentBranchCommits[currentBranchCommits.length - 1]?.sha || "",
          branchToMergeCommits[branchToMergeCommits.length - 1]?.sha || "",
        ].filter((sha) => sha !== ""),
        branch: this.currentBranch,
        refs: [this.currentBranch],
      }

      // Add commits from branch being merged that aren't already in current branch
      const newCommits = branchToMergeCommits.filter((commit) => !currentBranchCommits.some((existing) => existing.sha === commit.sha))
      updatedCommits = [...currentBranchCommits, ...newCommits, mergeCommit]
    }

    // Update both local and fetched commits to keep them in sync
    this.localBranchCommits.set(this.currentBranch, updatedCommits)
    this.commitsFetched.set(this.currentBranch, updatedCommits)

    return Promise.resolve()
  }

  pull: ({ exec }: { exec: Exec }) => Promise<void> = async () => {
    // Simulate pulling from remote origin
    const remoteBranchName = this.currentBranch
    const remoteCommits = this.remoteRepo.remoteBranches.get(remoteBranchName) || []

    if (remoteCommits.length > 0) {
      const currentCommits = this.localBranchCommits.get(this.currentBranch) || []
      const currentShas = new Set(currentCommits.map((c) => c.sha))

      // Add new commits from remote that we don't have locally
      const newCommits = remoteCommits.filter((commit) => !currentShas.has(commit.sha))

      if (newCommits.length > 0) {
        this.localBranchCommits.set(this.currentBranch, [...currentCommits, ...newCommits])
      }
    }

    return Promise.resolve()
  }

  setUser: ({ exec, name, email }: { exec: Exec; name: string; email: string }) => Promise<void> = () => {
    return Promise.resolve()
  }

  squash: (
    { exec, branchToSquash, branchMergingInto, commitTitle, commitMessage }: {
      exec: Exec
      branchToSquash: string
      branchMergingInto: string
      commitTitle: string
      commitMessage: string
    },
  ) => Promise<void> = async ({ branchToSquash, branchMergingInto, commitTitle, commitMessage }) => {
    const branchToSquashCommits = this.localBranchCommits.get(branchToSquash) || []
    const targetBranchCommits = this.localBranchCommits.get(branchMergingInto) || []

    if (branchToSquashCommits.length === 0) {
      throw new Error(`Branch '${branchToSquash}' has no commits or does not exist`)
    }

    // Create a single squashed commit representing all commits from the branch being squashed
    const squashedCommit: GitCommit = {
      title: commitTitle,
      sha: this.generateSha(),
      abbreviatedSha: this.generateSha().substring(0, 8),
      message: `${commitTitle}\n\n${commitMessage}`,
      messageLines: [commitTitle, "", commitMessage],
      author: { name: "Test User", email: "test@example.com" },
      committer: { name: "Test User", email: "test@example.com" },
      date: new Date(),
      filesChanged: [], // TODO: Could aggregate all files changed across squashed commits
      isMergeCommit: false,
      isRevertCommit: false,
      parents: [targetBranchCommits[targetBranchCommits.length - 1]?.sha || ""],
      branch: branchMergingInto,
      refs: [branchMergingInto],
    }

    // Add the squashed commit to the target branch
    this.localBranchCommits.set(branchMergingInto, [...targetBranchCommits, squashedCommit])

    // Remove the squashed branch
    this.localBranchCommits.delete(branchToSquash)
    this.branches = this.branches.filter((branch) => branch !== branchToSquash)

    return Promise.resolve()
  }

  rebase: ({ exec, branchToRebaseOnto }: { exec: Exec; branchToRebaseOnto: string }) => Promise<void> = async ({ branchToRebaseOnto }) => {
    const currentBranchCommits = this.localBranchCommits.get(this.currentBranch) || []
    const targetBranchCommits = this.localBranchCommits.get(branchToRebaseOnto) || []

    if (targetBranchCommits.length === 0) {
      throw new Error(`Target branch '${branchToRebaseOnto}' has no commits or does not exist`)
    }

    // Find the common ancestor (simplified: assume it's the base of current branch)
    // In a real implementation, you'd find the actual merge base
    const commitsToRebase = currentBranchCommits.slice() // Copy all commits to rebase

    // Create new commits with updated parents, simulating the rebase
    const rebasedCommits: GitCommit[] = []

    for (let i = 0; i < commitsToRebase.length; i++) {
      const commit = commitsToRebase[i]
      const rebasedCommit: GitCommit = {
        ...commit,
        sha: this.generateSha(), // New SHA after rebase
        abbreviatedSha: this.generateSha().substring(0, 8),
        parents: i === 0
          ? [targetBranchCommits[targetBranchCommits.length - 1]?.sha || ""] // First commit parents to tip of target branch
          : [rebasedCommits[i - 1]?.sha || ""], // Subsequent commits parent to previous rebased commit
        date: new Date(), // Update timestamp
      }
      rebasedCommits.push(rebasedCommit)
    }

    // Replace current branch commits with target branch commits + rebased commits
    this.localBranchCommits.set(this.currentBranch, [...targetBranchCommits, ...rebasedCommits])

    return Promise.resolve()
  }

  getLatestCommitsSince({ exec, commit }: { exec: Exec; commit: GitCommit }): Promise<GitCommit[]> {
    // Reuse getCommits to get the full commit history, then slice from the specified commit
    return this.getCommits({ exec, branch: { ref: this.currentBranch } }).then((allCommits) => {
      // Find the index of the given commit (commits are in reverse chronological order from getCommits)
      const commitIndex = allCommits.findIndex((c) => c.sha === commit.sha)

      if (commitIndex === -1) {
        // Commit not found, return all commits (assuming the commit is older than all we have)
        return allCommits
      }

      // Return commits that come before the found commit (since commits are in reverse chronological order)
      return allCommits.slice(0, commitIndex)
    })
  }

  getLatestCommitOnBranch({ exec: _exec, branch }: { exec: Exec; branch: { ref: string } }): Promise<GitCommit | undefined> {
    // Extract branch name from ref (handle both local and remote refs)
    const branchName = branch.ref.startsWith("origin/") ? branch.ref.replace("origin/", "") : branch.ref
    const branchCommits = this.localBranchCommits.get(branchName) || []

    // Return the latest (last) commit on the branch
    const latestCommit = branchCommits.length > 0 ? branchCommits[branchCommits.length - 1] : undefined
    return Promise.resolve(latestCommit)
  }

  createLocalBranchFromRemote: ({ exec, branch }: { exec: Exec; branch: string }) => Promise<void> = async ({ branch }) => {
    // Check if remote branch exists
    const remoteCommits = this.remoteRepo.remoteBranches.get(branch) || []

    if (remoteCommits.length === 0) {
      throw new Error(`Remote branch '${branch}' does not exist`)
    }

    // Check if local branch already exists (like real implementation)
    const localBranchExists = this.localBranchCommits.has(branch)

    // Only create local branch if it doesn't exist (like real implementation)
    if (!localBranchExists) {
      // Create local branch with commits from remote
      this.localBranchCommits.set(branch, [...remoteCommits])

      // Add to branches list if not already there
      if (!this.branches.includes(branch)) {
        this.branches.push(branch)
      }
    }

    // Add remote branch reference to branches if not already there (simulates fetch behavior)
    const remoteBranchRef = `origin/${branch}`
    if (!this.branches.includes(remoteBranchRef)) {
      this.branches.push(remoteBranchRef)
    }

    // Simulate "pull" - merge any new remote commits that aren't in local branch
    const localCommits = this.localBranchCommits.get(branch) || []
    const localShas = new Set(localCommits.map((c) => c.sha))
    const newRemoteCommits = remoteCommits.filter((commit) => !localShas.has(commit.sha))

    if (newRemoteCommits.length > 0) {
      this.localBranchCommits.set(branch, [...localCommits, ...newRemoteCommits])
    }

    return Promise.resolve()
  }

  getCommits: ({ exec, branch, limit }: { exec: Exec; branch: { ref: string }; limit?: number }) => Promise<GitCommit[]> = async (
    { branch, limit },
  ) => {
    // After fetch, we should return the complete commit history (from commitsFetched)
    // Fall back to localBranchCommits only if no fetched commits are available
    let branchCommits: GitCommit[] = []

    if (this.commitsFetched.has(branch.ref)) {
      // Use fetched commits (complete history after fetch)
      branchCommits = this.commitsFetched.get(branch.ref) || []
    } else if (this.localBranchCommits.has(branch.ref)) {
      // Fall back to local commits if no fetched commits available
      branchCommits = this.localBranchCommits.get(branch.ref) || []
    }

    // Apply limit if specified
    if (limit && limit > 0) {
      // Return latest commits up to the limit (most recent first, so take from the end)
      return Promise.resolve(branchCommits.slice(-limit).reverse())
    }

    // Return all commits (most recent first)
    return Promise.resolve([...branchCommits].reverse())
  }

  getCurrentBranch: ({ exec }: { exec: Exec }) => Promise<string> = async () => {
    return Promise.resolve(this.currentBranch)
  }

  /**
   * expects to get a Map of branches (remote and local combined) where local branches are preferred so the remote ref will not be returned if there is a local branch.
   */
  getBranches: ({ exec }: { exec: Exec }) => Promise<Map<string, { ref: string }>> = async () => {
    const branchMap = new Map<string, { ref: string }>()

    // Add the remote  branches, first.
    this.branches.filter((branchRef) => branchRef.startsWith("origin/")).forEach((branchRef) => {
      const branchNameWithoutOrigin = branchRef.replace("origin/", "")
      branchMap.set(branchNameWithoutOrigin, { ref: branchRef })
    })

    // Add the local branches, next.
    this.branches.filter((branchRef) => !branchRef.startsWith("origin/")).forEach((branchRef) => {
      const branchNameWithoutOrigin = branchRef.replace("origin/", "")
      branchMap.set(branchNameWithoutOrigin, { ref: branchRef })
    })

    return Promise.resolve(branchMap)
  }

  // Helper methods for testing setup

  /** Add a commit to a specific branch */
  addCommit(branchName: string, commit: GitCommit): void {
    if (!this.localBranchCommits.has(branchName)) {
      this.localBranchCommits.set(branchName, [])
    }
    this.localBranchCommits.get(branchName)!.push(commit)
  }

  /** Add commits to the remote repository simulation */
  addRemoteCommits(branchName: string, commits: GitCommit[]): void {
    this.remoteRepo.remoteBranches.set(branchName, commits)
  }

  /** Add a tag to the remote repository simulation */
  addRemoteTag(tagName: string, commitSha: string): void {
    this.remoteRepo.remoteTags.set(tagName, commitSha)
  }

  /** Create a simple commit for testing */
  createTestCommit(title: string, options: Partial<GitCommit> = {}): GitCommit {
    return {
      title,
      sha: options.sha || this.generateSha(),
      abbreviatedSha: options.abbreviatedSha || this.generateSha().substring(0, 8),
      message: options.message || title,
      messageLines: options.messageLines || [title],
      author: options.author || { name: "Test User", email: "test@example.com" },
      committer: options.committer || { name: "Test User", email: "test@example.com" },
      date: options.date || new Date(),
      filesChanged: options.filesChanged || [],
      isMergeCommit: options.isMergeCommit || false,
      isRevertCommit: options.isRevertCommit || false,
      parents: options.parents || [],
      branch: options.branch,
      tags: options.tags,
      refs: options.refs,
      stats: options.stats,
      fileStats: options.fileStats,
    }
  }
}

export class EnvironmentStub implements Environment {
  // a number between 1 and 1000
  buildId: string = (Math.floor(Math.random() * 1000) + 1).toString()

  constructor(
    private args: {
      commandToRunStubStepScript: string
      runFromPullRequest?: { baseBranch: string; targetBranch: string; prNumber: number; simulatedMergeType: "merge" | "rebase" | "squash" }
      runFromPush?: { branch: string }
    },
  ) {}

  getRepository(): { owner: string; repo: string } {
    return {
      owner: "levibostian",
      repo: "decaf",
    }
  }
  getBuild(): { buildUrl?: string; buildId: string; currentBranch: string; ciService: string } {
    const currentBranch = this.args.runFromPush?.branch ?? this.args.runFromPullRequest?.baseBranch
    if (!currentBranch) {
      throw new Error("No branch provided")
    }

    return {
      buildId: this.buildId,
      currentBranch,
      ciService: "github",
    }
  }
  getSimulatedMergeType(): Promise<("merge" | "rebase" | "squash")[]> {
    const mergeType = this.args.runFromPullRequest?.simulatedMergeType ?? "merge"
    return Promise.resolve([mergeType])
  }
  getEventThatTriggeredThisRun(): "push" | "pull_request" | "other" {
    if (this.args.runFromPullRequest) {
      return "pull_request"
    }
    return "push"
  }
  isRunningInPullRequest(): { baseBranch: string; targetBranch: string; prNumber: number } | undefined {
    if (this.args.runFromPullRequest) {
      return {
        baseBranch: this.args.runFromPullRequest.baseBranch,
        targetBranch: this.args.runFromPullRequest.targetBranch,
        prNumber: this.args.runFromPullRequest.prNumber,
      }
    } else {
      return undefined
    }
  }
  getCommandsForStep({ stepName: _stepName }: { stepName: AnyStepName }): string[] | undefined {
    return this.args.commandToRunStubStepScript ? [this.args.commandToRunStubStepScript] : undefined
  }
  getGitConfigInput(): { name: string; email: string } | undefined {
    return undefined
  }
  getBranchFilters(): string[] {
    return []
  }
  getCommitLimit(): number {
    return 500
  }
  setOutput({ key: _key, value: _value }: { key: string; value: string }): Promise<void> {
    return Promise.resolve()
  }
  getUserConfigurationOptions(): { failOnDeployVerification: boolean; makePullRequestComment: boolean } {
    return {
      failOnDeployVerification: false,
      makePullRequestComment: false,
    }
  }
}
