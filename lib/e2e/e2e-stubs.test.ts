import { Exec } from "../exec.ts"
import { Git, GitRepoManager } from "../git.ts"
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
  // These properties are needed to match the Git class signature but aren't used in the stub
  private readonly exec: Exec | undefined
  private readonly directory: string | undefined

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

  fetch = async (): Promise<void> => {
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
  checkoutBranch = async (args: { branch: string; createBranchIfNotExist: boolean }): Promise<void> => {
    // Check if branch exists locally or remotely
    const branchExists = this.localBranchCommits.has(args.branch) || this.branches.includes(args.branch)

    if (!branchExists && !args.createBranchIfNotExist) {
      throw new Error(`Branch '${args.branch}' does not exist and createBranchIfNotExist is false`)
    }

    if (!branchExists && args.createBranchIfNotExist) {
      // Create new branch from current branch
      const currentBranchCommits = this.localBranchCommits.get(this.currentBranch) || []
      this.localBranchCommits.set(args.branch, [...currentBranchCommits]) // Copy commits from current branch
      this.branches.push(args.branch)
    }

    // If branch exists remotely but not locally, create local tracking branch
    if (!this.localBranchCommits.has(args.branch) && this.branches.includes(args.branch)) {
      const branchRef = args.branch
      if (branchRef.startsWith("origin/")) {
        const remoteBranchName = branchRef.replace("origin/", "")
        const remoteCommits = this.remoteRepo.remoteBranches.get(remoteBranchName) || []
        this.localBranchCommits.set(args.branch, [...remoteCommits])
      }
    }

    this.currentBranch = args.branch
    return Promise.resolve()
  }

  merge = async (args: {
    branchToMergeIn: string
    commitTitle: string
    commitMessage: string
    fastForward?: "--no-ff" | "--ff-only"
  }): Promise<void> => {
    const currentBranchCommits = this.localBranchCommits.get(this.currentBranch) || []
    const branchToMergeCommits = this.localBranchCommits.get(args.branchToMergeIn) || []

    if (branchToMergeCommits.length === 0) {
      throw new Error(`Branch '${args.branchToMergeIn}' has no commits or does not exist`)
    }

    // Check if fast-forward is possible (current branch is behind the branch to merge)
    const canFastForward = currentBranchCommits.length === 0 ||
      branchToMergeCommits.some((commit) => currentBranchCommits[currentBranchCommits.length - 1]?.sha === commit.sha)

    if (args.fastForward === "--ff-only" && !canFastForward) {
      throw new Error("Cannot fast-forward merge - branches have diverged")
    }

    let updatedCommits: GitCommit[]

    if (args.fastForward !== "--no-ff" && canFastForward) {
      // Fast-forward merge: just add the new commits
      const newCommits = branchToMergeCommits.filter((commit) => !currentBranchCommits.some((existing) => existing.sha === commit.sha))
      updatedCommits = [...currentBranchCommits, ...newCommits]
    } else {
      // Create merge commit
      const mergeCommit: GitCommit = {
        title: args.commitTitle,
        sha: this.generateSha(),
        abbreviatedSha: this.generateSha().substring(0, 8),
        message: `${args.commitTitle}\n\n${args.commitMessage}`,
        messageLines: [args.commitTitle, "", args.commitMessage],
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

  pull = async (): Promise<void> => {
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

  setUser = (_args: { name: string; email: string }): Promise<void> => {
    return Promise.resolve()
  }

  squash = async (args: {
    branchToSquash: string
    branchMergingInto: string
    commitTitle: string
    commitMessage: string
  }): Promise<void> => {
    const branchToSquashCommits = this.localBranchCommits.get(args.branchToSquash) || []
    const targetBranchCommits = this.localBranchCommits.get(args.branchMergingInto) || []

    if (branchToSquashCommits.length === 0) {
      throw new Error(`Branch '${args.branchToSquash}' has no commits or does not exist`)
    }

    // Create a single squashed commit representing all commits from the branch being squashed
    const squashedCommit: GitCommit = {
      title: args.commitTitle,
      sha: this.generateSha(),
      abbreviatedSha: this.generateSha().substring(0, 8),
      message: `${args.commitTitle}\n\n${args.commitMessage}`,
      messageLines: [args.commitTitle, "", args.commitMessage],
      author: { name: "Test User", email: "test@example.com" },
      committer: { name: "Test User", email: "test@example.com" },
      date: new Date(),
      filesChanged: [], // TODO: Could aggregate all files changed across squashed commits
      isMergeCommit: false,
      isRevertCommit: false,
      parents: [targetBranchCommits[targetBranchCommits.length - 1]?.sha || ""],
      branch: args.branchMergingInto,
      refs: [args.branchMergingInto],
    }

    // Add the squashed commit to the target branch
    this.localBranchCommits.set(args.branchMergingInto, [...targetBranchCommits, squashedCommit])

    // Remove the squashed branch
    this.localBranchCommits.delete(args.branchToSquash)
    this.branches = this.branches.filter((branch) => branch !== args.branchToSquash)

    return Promise.resolve()
  }

  rebase = async (args: { branchToRebaseOnto: string }): Promise<void> => {
    const currentBranchCommits = this.localBranchCommits.get(this.currentBranch) || []
    const targetBranchCommits = this.localBranchCommits.get(args.branchToRebaseOnto) || []

    if (targetBranchCommits.length === 0) {
      throw new Error(`Target branch '${args.branchToRebaseOnto}' has no commits or does not exist`)
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

  getLatestCommitsSince = async (args: { commit: GitCommit }): Promise<GitCommit[]> => {
    // Reuse getCommits to get the full commit history, then slice from the specified commit
    return this.getCommits({ branch: { ref: this.currentBranch } }).then((allCommits) => {
      // Find the index of the given commit (commits are in reverse chronological order from getCommits)
      const commitIndex = allCommits.findIndex((c) => c.sha === args.commit.sha)

      if (commitIndex === -1) {
        // Commit not found, return all commits (assuming the commit is older than all we have)
        return allCommits
      }

      // Return commits that come before the found commit (since commits are in reverse chronological order)
      return allCommits.slice(0, commitIndex)
    })
  }

  getLatestCommitOnBranch = async (args: { branch: { ref: string } }): Promise<GitCommit | undefined> => {
    // Extract branch name from ref (handle both local and remote refs)
    const branchName = args.branch.ref.startsWith("origin/") ? args.branch.ref.replace("origin/", "") : args.branch.ref
    const branchCommits = this.localBranchCommits.get(branchName) || []

    // Return the latest (last) commit on the branch
    const latestCommit = branchCommits.length > 0 ? branchCommits[branchCommits.length - 1] : undefined
    return Promise.resolve(latestCommit)
  }

  createLocalBranchFromRemote = async (args: { branch: string }): Promise<void> => {
    // Check if remote branch exists
    const remoteCommits = this.remoteRepo.remoteBranches.get(args.branch) || []

    if (remoteCommits.length === 0) {
      throw new Error(`Remote branch '${args.branch}' does not exist`)
    }

    // Check if local branch already exists (like real implementation)
    const localBranchExists = this.localBranchCommits.has(args.branch)

    // Only create local branch if it doesn't exist (like real implementation)
    if (!localBranchExists) {
      // Create local branch with commits from remote
      this.localBranchCommits.set(args.branch, [...remoteCommits])

      // Add to branches list if not already there
      if (!this.branches.includes(args.branch)) {
        this.branches.push(args.branch)
      }
    }

    // Add remote branch reference to branches if not already there (simulates fetch behavior)
    const remoteBranchRef = `origin/${args.branch}`
    if (!this.branches.includes(remoteBranchRef)) {
      this.branches.push(remoteBranchRef)
    }

    // Simulate "pull" - merge any new remote commits that aren't in local branch
    const localCommits = this.localBranchCommits.get(args.branch) || []
    const localShas = new Set(localCommits.map((c) => c.sha))
    const newRemoteCommits = remoteCommits.filter((commit) => !localShas.has(commit.sha))

    if (newRemoteCommits.length > 0) {
      this.localBranchCommits.set(args.branch, [...localCommits, ...newRemoteCommits])
    }

    return Promise.resolve()
  }

  getCommits = async (args: { branch: { ref: string }; limit?: number }): Promise<GitCommit[]> => {
    // After fetch, we should return the complete commit history (from commitsFetched)
    // Fall back to localBranchCommits only if no fetched commits are available
    let branchCommits: GitCommit[] = []

    if (this.commitsFetched.has(args.branch.ref)) {
      // Use fetched commits (complete history after fetch)
      branchCommits = this.commitsFetched.get(args.branch.ref) || []
    } else if (this.localBranchCommits.has(args.branch.ref)) {
      // Fall back to local commits if no fetched commits available
      branchCommits = this.localBranchCommits.get(args.branch.ref) || []
    }

    // Apply limit if specified
    if (args.limit && args.limit > 0) {
      // Return latest commits up to the limit (most recent first, so take from the end)
      return Promise.resolve(branchCommits.slice(-args.limit).reverse())
    }

    // Return all commits (most recent first)
    return Promise.resolve([...branchCommits].reverse())
  }

  getCurrentBranch = async (): Promise<string> => {
    return Promise.resolve(this.currentBranch)
  }

  /**
   * expects to get a Map of branches (remote and local combined) where local branches are preferred so the remote ref will not be returned if there is a local branch.
   */
  getBranches = async (): Promise<Map<string, { ref: string }>> => {
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

  getDirectory(): string {
    // If no directory was specified, return the current working directory
    return this.directory || Deno.cwd()
  }

  createIsolatedClone = async (): Promise<string> => {
    // For testing purposes, just return a mock directory path
    return Promise.resolve("/tmp/mock-clone")
  }

  removeIsolatedClone = async (_directory: string): Promise<void> => {
    // For testing purposes, this is a no-op
    return Promise.resolve()
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
      runFromPullRequest?: { baseBranch: string; targetBranch: string; prNumber: number }
      runFromPush?: { branch: string }
      simulatedMergeTypes?: ("merge" | "rebase" | "squash")[]
      makePullRequestComment?: boolean
      buildUrl?: string
      failOnDeployVerification?: boolean
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
      buildUrl: this.args.buildUrl,
    }
  }
  getSimulatedMergeTypes(): Promise<("merge" | "rebase" | "squash")[]> {
    // If explicitly provided, use those types
    if (this.args.simulatedMergeTypes) {
      return Promise.resolve(this.args.simulatedMergeTypes)
    }

    throw new Error("No simulated merge types provided in EnvironmentStub")
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
  getPullRequestCommentTemplate(): Promise<string | undefined> {
    return Promise.resolve(undefined)
  }
  getUserConfigurationOptions(): { failOnDeployVerification: boolean; makePullRequestComment: boolean } {
    return {
      failOnDeployVerification: this.args.failOnDeployVerification ?? false,
      makePullRequestComment: this.args.makePullRequestComment ?? false,
    }
  }
}

/**
 * GitRepoManager stub that returns the same GitStub instance instead of creating isolated clones.
 * This prevents e2e tests from trying to create actual git clones and run real git commands.
 */
export class GitRepoManagerStub implements GitRepoManager {
  // Track calls to getIsolatedClone() and removeIsolatedClone() for testing
  public cloneCalls: string[] = []
  public removeCalls: string[] = []
  private cloneCounter = 0
  private shouldThrowOnRemove = false

  constructor(private gitStub: Git) {
  }

  /**
   * Returns the Git stub instance for the current directory (no clone).
   * This is used in non-test mode where we want to work directly with the current repository.
   */
  getCurrentRepo(): Git {
    return this.gitStub
  }

  /**
   * Configure the stub to throw an error when removeIsolatedClone() is called.
   * Useful for testing error handling in cleanup logic.
   */
  setThrowOnRemove(shouldThrow: boolean): void {
    this.shouldThrowOnRemove = shouldThrow
  }

  async getIsolatedClone(): Promise<{ git: Git; directory: string }> {
    // Generate unique directory for each clone to simulate real behavior
    const directory = `/tmp/mock-clone-${this.cloneCounter++}`
    this.cloneCalls.push(directory)

    // Return the same git stub instance instead of creating a real clone
    return Promise.resolve({
      git: this.gitStub,
      directory,
    })
  }

  async removeIsolatedClone(directory: string): Promise<void> {
    this.removeCalls.push(directory)

    if (this.shouldThrowOnRemove) {
      throw new Error(`EACCES: permission denied, rmdir '${directory}'`)
    }

    // No-op in stub - nothing to clean up
    return Promise.resolve()
  }
}
