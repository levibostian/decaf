import { Exec } from "./exec.ts"
import * as log from "./log.ts"
import { GitCommit } from "./types/git.ts"
import * as shellQuote from "shell-quote"

/**
 * Git interface that defines all git operations.
 * Both the real Git class and test stubs should implement this interface.
 */
export interface Git {
  fetch(): Promise<void>
  checkoutBranch(args: { branch: string; createBranchIfNotExist: boolean }): Promise<void>
  merge(args: { branchToMergeIn: string; commitTitle: string; commitMessage: string; fastForward?: "--no-ff" | "--ff-only" }): Promise<void>
  pull(): Promise<void>
  setUser(args: { name: string; email: string }): Promise<void>
  squash(args: { branchToSquash: string; branchMergingInto: string; commitTitle: string; commitMessage: string }): Promise<void>
  rebase(args: { branchToRebaseOnto: string }): Promise<void>
  getLatestCommitsSince(args: { commit: GitCommit }): Promise<GitCommit[]>
  getLatestCommitOnBranch(args: { branch: { ref: string } }): Promise<GitCommit | undefined>
  createLocalBranchFromRemote(args: { branch: string }): Promise<void>
  getCommits(args: { branch: { ref: string }; limit?: number }): Promise<GitCommit[]>
  getCurrentBranch(): Promise<string>
  getBranches(): Promise<Map<string, { ref: string }>>
}

/**
 * Immutable Git class that's locked to a specific directory.
 * All git operations will be performed in the directory specified at construction.
 */
export class GitImpl implements Git {
  private readonly exec: Exec
  private readonly directory: string | undefined

  constructor(exec: Exec, directory?: string) {
    this.exec = exec
    this.directory = directory
  }

  async fetch(): Promise<void> {
    // A *complete* fetch that gets all branches, all commits, all tags.

    // First, try to unshallow if the repository is shallow.
    // will be shallow if we use the default actions/checkout configuration.
    try {
      await this.exec.run({
        command: `git fetch --unshallow --tags --all`,
        input: undefined,
        currentWorkingDirectory: this.directory,
      })
    } catch (_error) {
      // If repo is not shallow, it will throw exception "fatal: --unshallow on a complete repository does not make sense"
      // Fall back to non-shallow fetch command if ths happens.
      await this.exec.run({
        // --tags ensures that we get all tags from the remote repository.
        // --all ensures that we get all branches from the origin remote.
        command: `git fetch --tags --all`,
        input: undefined,
        currentWorkingDirectory: this.directory,
      })
    }
  }

  async checkoutBranch(args: { branch: string; createBranchIfNotExist: boolean }): Promise<void> {
    await this.exec.run({
      command: `git checkout ${args.createBranchIfNotExist ? "-b " : ""}${args.branch}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })
  }

  async merge(args: {
    branchToMergeIn: string
    commitTitle: string
    commitMessage: string
    fastForward?: "--no-ff" | "--ff-only"
  }): Promise<void> {
    // Use shell-quote to properly escape the commit message to prevent shell injection and parsing errors
    const escapedCommitTitle = shellQuote.quote([args.commitTitle])
    const escapedCommitMessage = shellQuote.quote([args.commitMessage])
    await this.exec.run({
      command: `git merge ${args.branchToMergeIn} -m ${escapedCommitTitle} -m ${escapedCommitMessage} ${args.fastForward || ""}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })
  }

  async pull(): Promise<void> {
    const currentBranchName = await this.getCurrentBranch()

    await this.exec.run({
      command: `git pull origin ${currentBranchName}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })
  }

  async setUser(args: { name: string; email: string }): Promise<void> {
    await this.exec.run({
      command: `git config user.name "${args.name}"`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })

    await this.exec.run({
      command: `git config user.email "${args.email}"`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })
  }

  // Squash all commits of a branch into 1 commit
  async squash(args: {
    branchToSquash: string
    branchMergingInto: string
    commitTitle: string
    commitMessage: string
  }): Promise<void> {
    // We need to find out how many commits 1 branch is ahead of the other to find out how many unique commits there are.
    const { stdout } = await this.exec.run({
      command: `git rev-list --count ${args.branchMergingInto}..${args.branchToSquash}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })

    const numberOfCommitsAheadOfBranchMergingInto = parseInt(stdout.trim())

    if (numberOfCommitsAheadOfBranchMergingInto === 0) {
      log.message(`Branches ${args.branchToSquash} and ${args.branchMergingInto} are already up to date. No commits to squash.`)
      return
    }

    // Now that we know how many commits are ahead, we can squash all of those commits into 1 commit.
    await this.exec.run({
      command: `git reset --soft HEAD~${numberOfCommitsAheadOfBranchMergingInto}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })

    // Use shell-quote to properly escape the commit message to prevent shell injection and parsing errors
    const escapedCommitTitle = shellQuote.quote([args.commitTitle])
    const escapedCommitMessage = shellQuote.quote([args.commitMessage])
    await this.exec.run({
      command: `git commit -m ${escapedCommitTitle} -m ${escapedCommitMessage}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })
  }

  async rebase(args: { branchToRebaseOnto: string }): Promise<void> {
    await this.exec.run({
      command: `git rebase ${args.branchToRebaseOnto}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })
  }

  async getLatestCommitsSince(args: { commit: GitCommit }): Promise<GitCommit[]> {
    const currentBranchName = await this.getCurrentBranch()

    const allCommits = await this.getCommits({ branch: { ref: currentBranchName } })

    // Find the index of the commit we're looking for
    const commitIndex = allCommits.findIndex((c) => c.sha === args.commit.sha)

    // Return all commits that come after the specified commit (commits since)
    return commitIndex === -1 ? allCommits : allCommits.slice(0, commitIndex)
  }

  // returns undefined when no commits are found on the branch
  async getLatestCommitOnBranch(args: { branch: { ref: string } }): Promise<GitCommit | undefined> {
    const commits = await this.getCommits({ branch: args.branch })

    if (commits.length === 0) {
      return undefined
    }

    // Return the most recent commit
    return commits[0]
  }

  /**
   * Makes sure that we have a local branch that has all of the commits that the remote branch has.
   *
   * There are a lot of commands here, just to get a local branch of a remote branch. After many attempts to simplify this, we would hit many different errors.
   * I believe that complexity comes because we run this tool on a CI server where the git config might be different.
   * Running all of these commands and running each command by itself (example: not running `git checkout -b` to try and combine creating a branch and checking it out)
   * have given the most consistent results.
   */
  async createLocalBranchFromRemote(args: { branch: string }): Promise<void> {
    const currentBranchName = await this.getCurrentBranch()
    const doesBranchExist = (await this.exec.run({
      command: `git branch --list ${args.branch}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })).stdout.trim() !== ""
    // Only run if it doesn't exist locally. This is to avoid a error that crashes the tool: "fatal: a branch named '<branch-name>' already exists"
    if (!doesBranchExist) {
      await this.exec.run({
        command: `git branch --track ${args.branch} origin/${args.branch}`,
        input: undefined,
        currentWorkingDirectory: this.directory,
      })
    }

    // Checkout the branch so we can pull it.
    await this.exec.run({
      command: `git checkout ${args.branch}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })

    // Pull the branch from the remote.
    // Adding --no-rebase to avoid an error that could happen when you run pull.
    // The error is: You have divergent branches and need to specify how to reconcile them.
    await this.exec.run({
      command: `git pull --no-rebase origin ${args.branch}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })

    // Switch back to the branch we were on before.
    await this.exec.run({
      command: `git checkout ${currentBranchName}`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })
  }

  /**
   * Able to get all commits for a given branch.
   *
   * **NOTE**: Be sure that `git fetch` is called before calling this command!! Otherwise, the commit history you get might be incomplete.
   */
  async getCommits(args: { branch: { ref: string }; limit?: number }): Promise<GitCommit[]> {
    // Use a more detailed pretty format to get more info per commit
    const limitArg = args.limit ? `-${args.limit}` : ""
    const { stdout } = await this.exec.run({
      /**
       * %H — Commit hash (SHA)
       * %s — Commit title/subject
       * %B — Raw body (full commit message)
       * %an — Author name
       * %ae — Author email
       * %cn — Committer name
       * %ce — Committer email
       * %ci — Commit date (ISO 8601)
       * %P — Parent commit hashes (space-separated)
       * %D — Refs (branches, tags, HEAD) pointing to this commit
       * --numstat outputs the number of added and deleted lines for each file changed in the commit.
       *
       * [[⬛]] is used to separate commits. [⬛] is used to separate fields within a commit.
       * Newlines are not reliable because the commit message body can contain newlines, written
       * by the commit author.
       */
      command: `git log ${limitArg} --pretty=format:"[[⬛]]%H[⬛]%s[⬛]%B[⬛]%an[⬛]%ae[⬛]%cn[⬛]%ce[⬛]%ci[⬛]%P[⬛]%D" --numstat ${args.branch.ref}`,
      input: undefined,
      displayLogs: false,
      currentWorkingDirectory: this.directory,
    })

    // Split by commit separator to separate commits. We can't use another method like newlines because the git message body might contain newlines.
    const rawCommits = stdout.trim().split("[[⬛]]").filter((commitBlock) => commitBlock.trim() !== "")
    if (rawCommits.length === 0) {
      log.message(`No commits found on branch ${args.branch}.`)
      return []
    }

    const commits: GitCommit[] = rawCommits.map((commitBlock) => {
      const parts = commitBlock.split("[⬛]")
      const [
        sha,
        title,
        message,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        dateString,
        parentsString,
        refsAndStatsString,
      ] = parts

      // Parse file stats - they come after the refs, separated by newlines
      const filesChanged: string[] = []
      let additions = 0
      let deletions = 0
      const fileStats: Array<{ filename: string; additions: number; deletions: number }> = []

      // Split refs and file stats by newlines
      const lines = refsAndStatsString ? refsAndStatsString.split("\n") : []
      const refsString = lines[0] || ""
      const fileStatsLines = lines.slice(1)

      fileStatsLines.forEach((line) => {
        const parts = line.trim().split("\t")
        if (parts.length === 3) {
          const [add, del, filename] = parts
          filesChanged.push(filename)
          const addNum = add === "-" ? 0 : parseInt(add, 10)
          const delNum = del === "-" ? 0 : parseInt(del, 10)
          additions += addNum
          deletions += delNum
          fileStats.push({ filename, additions: addNum, deletions: delNum })
        }
      })

      // ".filter(Boolean)" removes empty strings that can occur from multiple spaces in git output (e.g., "parent1  parent2" → ["parent1", "", "parent2"] -> ["parent1", "parent2"])
      const parents = parentsString ? parentsString.trim().split(" ").filter(Boolean) : []
      const refs = refsString ? refsString.split(",").map((r) => r.trim()).filter(Boolean) : []
      const tags = refs.filter((ref) => ref.startsWith("tag: ")).map((ref) => ref.replace("tag: ", ""))

      // Two-tier branch selection strategy using || for fallback logic:
      // Tier 1 (preferred): Find local branches only (no slashes, excludes remotes like "origin/main")
      // Tier 2 (fallback): If no local branches found, accept remote branches (allows slashes)
      // Both tiers exclude tags ("tag: v1.0.0") and HEAD references ("HEAD -> main")
      // Examples: ["origin/main", "main"] → picks "main" | ["origin/main"] → picks "origin/main"
      const branchRef = refs.find((ref) => !ref.startsWith("tag: ") && !ref.startsWith("HEAD") && !ref.includes("/")) ||
        refs.find((ref) => !ref.startsWith("tag: ") && !ref.startsWith("HEAD"))
      const branch = branchRef ? branchRef : undefined

      // merge commits are regular git commits but with multiple parents.
      // 1 commit is the previous commit on that branch.
      // 1 commit is the new commit that was merged in.
      const isMergeCommit = parents.length > 1
      const isRevertCommit = /^revert/i.test(title)

      return {
        title: title.trim(),
        sha: sha.trim(),
        abbreviatedSha: sha.trim().substring(0, 8),
        message: message.trim(),
        messageLines: message.trim().split("\n"),
        author: { name: authorName.trim(), email: authorEmail.trim() },
        committer: { name: committerName.trim(), email: committerEmail.trim() },
        date: new Date(dateString.trim()),
        filesChanged,
        isMergeCommit,
        isRevertCommit,
        parents,
        branch,
        tags,
        refs,
        stats: { additions, deletions, total: additions + deletions },
        fileStats,
      }
    })

    return commits
  }

  async getCurrentBranch(): Promise<string> {
    const { stdout } = await this.exec.run({
      command: `git branch --show-current`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })
    return stdout.trim()
  }

  async getBranches(): Promise<Map<string, { ref: string }>> {
    /*
     * We call "git fetch" before running the tool. fetch does not create a local branch which by default will not show up when you call `git branch`.
     * The implementation of this function is to get a list of all local and remote branches. So we run multiple commands to get all branches.
     */
    const { stdout } = await this.exec.run({
      command: `git branch -a --format='%(refname:short)'`,
      input: undefined,
      currentWorkingDirectory: this.directory,
    })

    const branchMap = new Map<string, { ref: string }>()

    const branches = stdout.trim().split("\n")
      .map((branch) => branch.trim())
      .filter((branch) => branch !== "")
      // filter out github pull request branches. Example: pull/80/merge
      .filter((branch) => !branch.startsWith("pull/"))
      // filter out remote pull request branches. Example: remote/pr/123
      .filter((branch) => !branch.startsWith("remote/"))
      // Filter out HEAD reference (both local and remote)
      .filter((branch) => branch !== "HEAD" && !branch.endsWith("/HEAD"))
      // Filter out 'origin' reference, which is not a branch
      .filter((branch) => branch !== "origin")

    // Process branches in two passes:
    // 1. First, add all local branches (no 'origin/' prefix)
    // 2. Then, add remote branches only if no local version exists

    // Pass 1: Add local branches
    branches.forEach((fullBranchRef) => {
      if (!fullBranchRef.startsWith("origin/")) {
        // This is a local branch
        branchMap.set(fullBranchRef, { ref: fullBranchRef })
      }
    })

    // Pass 2: Add remote branches only if local version doesn't exist
    branches.forEach((fullBranchRef) => {
      if (fullBranchRef.startsWith("origin/")) {
        const branchName = fullBranchRef.replace("origin/", "")
        // Only add if we don't already have a local version
        if (!branchMap.has(branchName)) {
          branchMap.set(branchName, { ref: fullBranchRef })
        }
      }
    })

    return branchMap
  }
}

/**
 * GitRepoManager provides access to git repositories.
 * It can either provide access to the current repository or create isolated clones for testing.
 */
export interface GitRepoManager {
  /**
   * Creates an isolated git clone in a temporary directory.
   * This allows git operations to be performed without affecting the main repository.
   * All commits made in this clone are isolated and will be discarded when the clone is removed.
   * Returns a Git instance locked to the clone directory.
   */
  getIsolatedClone(): Promise<{ git: Git; directory: string }>

  /**
   * Returns a Git instance for the current directory (no clone).
   * This is used in non-test mode where we want to work directly with the current repository.
   */
  getCurrentRepo(): Git

  /**
   * Removes the isolated git clone directory.
   */
  removeIsolatedClone(directory: string): Promise<void>
}

export class GitRepoManagerImpl implements GitRepoManager {
  private readonly exec: Exec

  constructor(exec: Exec) {
    this.exec = exec
  }

  getCurrentRepo(): Git {
    return new GitImpl(this.exec)
  }

  async getIsolatedClone(): Promise<{ git: Git; directory: string }> {
    const cloneDirectory = await Deno.makeTempDir({
      prefix: "decaf-clone-",
    })

    // Get the current repository path to clone from
    const { stdout: repoPath } = await this.exec.run({
      command: `git rev-parse --show-toplevel`,
      input: undefined,
    })

    // Get the remote URL from the original repository
    const { stdout: remoteUrl } = await this.exec.run({
      command: `git config --get remote.origin.url`,
      input: undefined,
    })

    // Get the current branch or commit in the original repo
    const { stdout: currentRef } = await this.exec.run({
      command: `git rev-parse HEAD`,
      input: undefined,
    })

    // Create a local clone of the repository
    // This gives us complete isolation - commits in the clone won't affect the original repo
    await this.exec.run({
      command: `git clone ${repoPath.trim()} ${cloneDirectory}`,
      input: undefined,
    })

    // Update the origin remote to point to the actual remote, not the local path
    // This ensures that git fetch will fetch from the real remote
    await this.exec.run({
      command: `git remote set-url origin ${remoteUrl.trim()}`,
      input: undefined,
      currentWorkingDirectory: cloneDirectory,
    })

    // Checkout the same commit as the original repo to avoid detached HEAD issues
    await this.exec.run({
      command: `git checkout ${currentRef.trim()}`,
      input: undefined,
      currentWorkingDirectory: cloneDirectory,
    })

    log.debug(`Created isolated git clone at ${cloneDirectory}`)

    // Return a Git instance locked to this clone's directory
    return {
      git: new GitImpl(this.exec, cloneDirectory),
      directory: cloneDirectory,
    }
  }

  async removeIsolatedClone(directory: string): Promise<void> {
    // Simply remove the directory - it's a separate clone, not a worktree
    // Using rm -rf is safe here because we created a temp directory specifically for this
    await this.exec.run({
      command: `rm -rf ${directory}`,
      input: undefined,
    })

    log.debug(`Removed isolated git clone at ${directory}`)
  }
}

// Factory function for creating a Git instance for the current working directory
export const createGit = (exec: Exec, directory?: string): Git => {
  return new GitImpl(exec, directory)
}

// Factory function for creating a GitRepoManager instance
export const createGitRepoManager = (exec: Exec): GitRepoManager => {
  return new GitRepoManagerImpl(exec)
}
