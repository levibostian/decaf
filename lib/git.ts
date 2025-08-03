import { Exec } from "./exec.ts"
import * as log from "./log.ts"
import { GitCommit } from "./types/git.ts"

export interface Git {
  checkoutBranch: (
    { exec, branch, createBranchIfNotExist }: { exec: Exec; branch: string; createBranchIfNotExist: boolean },
  ) => Promise<void>
  merge: (
    { exec, branchToMergeIn, commitTitle, commitMessage, fastForward }: {
      exec: Exec
      branchToMergeIn: string
      commitTitle: string
      commitMessage: string
      fastForward?: "--no-ff" | "--ff-only"
    },
  ) => Promise<void>
  pull: ({ exec }: { exec: Exec }) => Promise<void>
  setUser: (
    { exec, name, email }: { exec: Exec; name: string; email: string },
  ) => Promise<void>
  squash: (
    { exec, branchToSquash, branchMergingInto, commitTitle, commitMessage }: {
      exec: Exec
      branchToSquash: string
      branchMergingInto: string
      commitTitle: string
      commitMessage: string
    },
  ) => Promise<void>
  rebase: (
    { exec, branchToRebaseOnto }: { exec: Exec; branchToRebaseOnto: string },
  ) => Promise<void>
  getLatestCommitsSince({ exec, commit }: { exec: Exec; commit: GitCommit }): Promise<GitCommit[]>
  getLatestCommitOnBranch({ exec, branch }: { exec: Exec; branch: string }): Promise<GitCommit>
  createLocalBranchFromRemote: ({ exec, branch }: { exec: Exec; branch: string }) => Promise<void>
  getCommits: ({ exec, branch }: { exec: Exec; branch: string }) => Promise<GitCommit[]>
  getCurrentBranch: ({ exec }: { exec: Exec }) => Promise<string>
  getLocalBranches: ({ exec }: { exec: Exec }) => Promise<string[]>
}

const checkoutBranch = async (
  { exec, branch, createBranchIfNotExist }: { exec: Exec; branch: string; createBranchIfNotExist: boolean },
): Promise<void> => {
  await exec.run({
    command: `git checkout ${createBranchIfNotExist ? "-b " : ""}${branch}`,
    input: undefined,
  })
}

const merge = async (
  { exec, branchToMergeIn, commitTitle, commitMessage, fastForward }: {
    exec: Exec
    branchToMergeIn: string
    commitTitle: string
    commitMessage: string
    fastForward?: "--no-ff" | "--ff-only"
  },
): Promise<void> => {
  await exec.run({
    command: `git merge ${branchToMergeIn} -m "${commitTitle}" -m "${commitMessage}" ${fastForward || ""}`,
    input: undefined,
  })
}

const pull = async ({ exec }: { exec: Exec }): Promise<void> => {
  const currentBranchName = await getCurrentBranch({ exec })

  await exec.run({
    command: `git pull origin ${currentBranchName}`,
    input: undefined,
  })
}

const setUser = async (
  { exec, name, email }: { exec: Exec; name: string; email: string },
): Promise<void> => {
  await exec.run({
    command: `git config user.name "${name}"`,
    input: undefined,
  })

  await exec.run({
    command: `git config user.email "${email}"`,
    input: undefined,
  })
}

// Squash all commits of a branch into 1 commit
const squash = async (
  { exec, branchToSquash, branchMergingInto, commitTitle, commitMessage }: {
    exec: Exec
    branchToSquash: string
    branchMergingInto: string
    commitTitle: string
    commitMessage: string
  },
): Promise<void> => {
  // We need to find out how many commits 1 branch is ahead of the other to find out how many unique commits there are.
  const { stdout } = await exec.run({
    command: `git rev-list --count ${branchMergingInto}..${branchToSquash}`,
    input: undefined,
  })

  const numberOfCommitsAheadOfBranchMergingInto = parseInt(stdout.trim())

  if (numberOfCommitsAheadOfBranchMergingInto === 0) {
    log.message(`Branches ${branchToSquash} and ${branchMergingInto} are already up to date. No commits to squash.`)
    return
  }

  // Now that we know how many commits are ahead, we can squash all of those commits into 1 commit.
  await exec.run({
    command: `git reset --soft HEAD~${numberOfCommitsAheadOfBranchMergingInto}`,
    input: undefined,
  })
  await exec.run({
    command: `git commit -m "${commitTitle}" -m "${commitMessage}"`,
    input: undefined,
  })
}

const rebase = async (
  { exec, branchToRebaseOnto }: { exec: Exec; branchToRebaseOnto: string },
): Promise<void> => {
  await exec.run({
    command: `git rebase ${branchToRebaseOnto}`,
    input: undefined,
  })
}

const getLatestCommitsSince = async (
  { exec, commit }: { exec: Exec; commit: GitCommit },
): Promise<GitCommit[]> => {
  const currentBranchName = await getCurrentBranch({ exec })

  const allCommits = await getCommits({ exec, branch: currentBranchName })

  // Find the index of the commit we're looking for
  const commitIndex = allCommits.findIndex((c) => c.sha === commit.sha)

  // Return all commits that come after the specified commit (commits since)
  return commitIndex === -1 ? allCommits : allCommits.slice(0, commitIndex)
}

const getLatestCommitOnBranch = async (
  { exec, branch }: { exec: Exec; branch: string },
): Promise<GitCommit> => {
  const commits = await getCommits({ exec, branch })

  // TODO: Make this function return a optional.
  if (commits.length === 0) {
    throw new Error(`No commits found on branch ${branch}`)
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
const createLocalBranchFromRemote = async (
  { exec, branch }: { exec: Exec; branch: string },
): Promise<void> => {
  const currentBranchName = await getCurrentBranch({ exec })
  const doesBranchExist = (await exec.run({
    command: `git branch --list ${branch}`,
    input: undefined,
  })).stdout.trim() !== ""

  // Perform a fetch, otherwise you might get errors about origin branch not being found.
  await exec.run({
    command: `git fetch origin`,
    input: undefined,
  })

  // Only run if it doesn't exist locally. This is to avoid a error that crashes the tool: "fatal: a branch named '<branch-name>' already exists"
  if (!doesBranchExist) {
    await exec.run({
      command: `git branch --track ${branch} origin/${branch}`,
      input: undefined,
    })
  }

  // Checkout the branch so we can pull it.
  await exec.run({
    command: `git checkout ${branch}`,
    input: undefined,
  })

  // Pull the branch from the remote.
  // Adding --no-rebase to avoid an error that could happen when you run pull.
  // The error is: You have divergent branches and need to specify how to reconcile them.
  await exec.run({
    command: `git pull --no-rebase origin ${branch}`,
    input: undefined,
  })

  // Switch back to the branch we were on before.
  await exec.run({
    command: `git checkout ${currentBranchName}`,
    input: undefined,
  })
}

const getCommits = async (
  { exec, branch }: { exec: Exec; branch: string },
): Promise<GitCommit[]> => {
  // Use a more detailed pretty format to get more info per commit
  const { stdout } = await exec.run({
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
     * The || is used to separate commits. Single | is used to separate fields within a commit.
     * Newlines are not reliable because the commit message body can contain newlines, written
     * by the commit author.
     */
    command: `git log --pretty=format:"||%H|%s|%B|%an|%ae|%cn|%ce|%ci|%P|%D" --numstat ${branch}`,
    input: undefined,
  })

  // Split by double pipes (||) to separate commits. We can't use another method like newlines because the git message body might contain newlines.
  const rawCommits = stdout.trim().split("||").filter((commitBlock) => commitBlock.trim() !== "")
  if (rawCommits.length === 0) {
    log.message(`No commits found on branch ${branch}.`)
    return []
  }

  const commits: GitCommit[] = rawCommits.map((commitBlock) => {
    const parts = commitBlock.split("|")
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

const getCurrentBranch = async ({ exec }: { exec: Exec }): Promise<string> => {
  const { stdout } = await exec.run({
    command: `git branch --show-current`,
    input: undefined,
  })
  return stdout.trim()
}

const getLocalBranches = async ({ exec }: { exec: Exec }): Promise<string[]> => {
  const { stdout } = await exec.run({
    command: `git branch --format='%(refname:short)'`,
    input: undefined,
  })
  return stdout.trim().split("\n").map((branch) => branch.trim()).filter((branch) => branch !== "")
}

export const git: Git = {
  checkoutBranch,
  merge,
  pull,
  setUser,
  squash,
  rebase,
  getCommits,
  getLatestCommitsSince,
  getLatestCommitOnBranch,
  createLocalBranchFromRemote,
  getCurrentBranch,
  getLocalBranches,
}
