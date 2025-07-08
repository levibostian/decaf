import { exec } from "./exec.ts"
import { Exec } from "./exec.ts"
import { GitHubCommit } from "./github-api.ts"
import * as log from "./log.ts"

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
  getLatestCommitsSince({ exec, commit }: { exec: Exec; commit: GitHubCommit }): Promise<GitHubCommit[]>
  getLatestCommitOnBranch({ exec, branch }: { exec: Exec; branch: string }): Promise<GitHubCommit>
  createLocalBranchFromRemote: ({ exec, branch }: { exec: Exec; branch: string }) => Promise<void>
  getCommits: ({ exec, branch }: { exec: Exec; branch: string }) => Promise<GitHubCommit[]>
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
  await exec.run({
    command: `git pull`,
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
  { exec, commit }: { exec: Exec; commit: GitHubCommit },
): Promise<GitHubCommit[]> => {
  const { stdout } = await exec.run({
    command: `git log --pretty=format:"%H|%s|%ci" ${commit.sha}..HEAD`,
    input: undefined,
  })

  return stdout.trim().split("\n").map((commitString) => {
    const [sha, message, dateString] = commitString.split("|")

    return { sha, message, date: new Date(dateString) }
  })
}

const getLatestCommitOnBranch = async (
  { exec, branch }: { exec: Exec; branch: string },
): Promise<GitHubCommit> => {
  const { stdout } = await exec.run({
    command: `git log -1 --pretty=format:"%H|%s|%ci" ${branch}`,
    input: undefined,
  })

  const [sha, message, dateString] = stdout.trim().split("|")

  return { sha, message, date: new Date(dateString) }
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
  const currentBranchName = (await exec.run({
    command: `git branch --show-current`,
    input: undefined,
  })).stdout.trim()
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
): Promise<GitHubCommit[]> => {
  const currentBranchName = (await exec.run({
    command: `git branch --show-current`,
    input: undefined,
  })).stdout.trim()

  await checkoutBranch({ exec, branch, createBranchIfNotExist: false })

  const { stdout } = await exec.run({
    command: `git log --pretty=format:"%H|%s|%ci"`,
    input: undefined,
  })

  const commits = stdout.trim().split("\n").map((commitString) => {
    const [sha, message, dateString] = commitString.split("|")

    return { sha, message, date: new Date(dateString) }
  })

  await checkoutBranch({ exec, branch: currentBranchName, createBranchIfNotExist: false })

  return commits
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
}
