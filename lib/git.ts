import { Exec } from "./exec.ts";
import { GitHubCommit } from "./github-api.ts";
import * as log from "./log.ts";

export interface Git {
  add: ({ exec, filePath }: { exec: Exec; filePath: string }) => Promise<void>;
  commit: (
    { exec, message, dryRun }: { exec: Exec; message: string; dryRun: boolean },
  ) => Promise<GitHubCommit>;
  push: (
    { exec, branch, forcePush, dryRun }: { exec: Exec; branch: string; forcePush: boolean; dryRun: boolean },
  ) => Promise<void>;
  areAnyFilesStaged: ({ exec }: { exec: Exec }) => Promise<boolean>;
  deleteBranch: (
    { exec, branch, dryRun }: { exec: Exec; branch: string; dryRun: boolean },
  ) => Promise<void>;
  checkoutBranch: (
    { exec, branch, createBranchIfNotExist }: { exec: Exec; branch: string; createBranchIfNotExist: boolean },
  ) => Promise<void>;
  doesLocalBranchExist: (
    { exec, branch }: { exec: Exec; branch: string },
  ) => Promise<boolean>;
  merge: ({exec, branchToMergeIn, commitTitle, commitMessage, fastForwardOnly }: {exec: Exec, branchToMergeIn: string, commitTitle: string, commitMessage: string, fastForwardOnly?: boolean }) => Promise<void>;
  pull: ({exec}: {exec: Exec}) => Promise<void>;
  setUser: (
    { exec, name, email }: { exec: Exec; name: string; email: string },
  ) => Promise<void>;
  squash: ({ exec, branchToSquash, branchMergingInto, commitTitle, commitMessage }: { exec: Exec; branchToSquash: string; branchMergingInto: string; commitTitle: string; commitMessage: string }) => Promise<void>;
  rebase: (
    { exec, branchToRebaseOnto }: { exec: Exec; branchToRebaseOnto: string },
  ) => Promise<void>;
}

const add = async (
  { exec, filePath }: { exec: Exec; filePath: string },
): Promise<void> => {
  await exec.run({
    command: `git add ${filePath}`,
    input: undefined,
  });
};

const commit = async (
  { exec, message, dryRun }: { exec: Exec; message: string; dryRun: boolean },
): Promise<GitHubCommit> => {
  if (await areAnyFilesStaged({ exec })) {
    // The author is the github actions bot.
    // Resources to find this author info:
    // https://github.com/orgs/community/discussions/26560
    // https://github.com/peter-evans/create-pull-request/blob/0c2a66fe4af462aa0761939bd32efbdd46592737/action.yml
    await exec.run({
      command: `git commit -m "${message}"${dryRun ? " --dry-run" : ""}`,
      input: undefined,
      envVars: {
        GIT_AUTHOR_NAME: "github-actions[bot]",
        GIT_COMMITTER_NAME: "github-actions[bot]",
        GIT_AUTHOR_EMAIL:
          "41898282+github-actions[bot]@users.noreply.github.com",
        GIT_COMMITTER_EMAIL:
          "41898282+github-actions[bot]@users.noreply.github.com",
      },
    });
  }

  return getLatestCommit({ exec });
};

const push = async (
  { exec, branch, forcePush, dryRun }: { exec: Exec; branch: string; forcePush: boolean; dryRun: boolean },
): Promise<void> => {
  const gitCommand = `git push origin ${branch}${forcePush ? " --force" : ""}`;

  if (dryRun) {
    log.message(`[Dry Run] ${gitCommand}`);
    return;
  }

  await exec.run({
    command: gitCommand,
    input: undefined,
  });
};

const areAnyFilesStaged = async (
  { exec }: { exec: Exec },
): Promise<boolean> => {
  const { stdout } = await exec.run({
    command: `git diff --cached --name-only`,
    input: undefined,
  });

  return stdout.trim() !== "";
};

const getLatestCommit = async (
  { exec }: { exec: Exec },
): Promise<GitHubCommit> => {
  const { stdout } = await exec.run({
    command: `git log -1 --pretty=format:"%H%n%s%n%ci"`,
    input: undefined,
  });

  const [sha, message, dateString] = stdout.trim().split("\n");

  return { sha, message, date: new Date(dateString) };
};

const deleteBranch = async (
  { exec, branch, dryRun }: { exec: Exec; branch: string; dryRun: boolean },
): Promise<void> => {
  const deleteLocalBranchCommand = `git branch -D ${branch}`;

  if (dryRun) {
    log.message(`[Dry Run] ${deleteLocalBranchCommand}`);
  } else {
    await exec.run({
      command: deleteLocalBranchCommand,
      input: undefined,
    });
  }
}

const checkoutBranch = async (
  { exec, branch, createBranchIfNotExist }: { exec: Exec; branch: string; createBranchIfNotExist: boolean },
): Promise<void> => {
  await exec.run({
    command: `git checkout ${createBranchIfNotExist ? "-b " : ""}${branch}`,
    input: undefined,
  });
}

const doesLocalBranchExist = async (
  { exec, branch }: { exec: Exec; branch: string },
): Promise<boolean> => {
  const { exitCode } = await exec.run({
    command: `git show-ref --verify --quiet refs/heads/${branch}`,
    input: undefined,
    throwOnNonZeroExitCode: false,
  });

  return exitCode === 0;
}

const merge = async({exec, branchToMergeIn, commitTitle, commitMessage, fastForwardOnly}: {exec: Exec, branchToMergeIn: string, commitTitle: string, commitMessage: string, fastForwardOnly?: boolean}): Promise<void> => {
  await exec.run({
    command: `git merge ${branchToMergeIn} -m "${commitTitle}" -m "${commitMessage}"${fastForwardOnly ? " --ff-only" : ""}`,
    input: undefined,
  });
}

const pull = async({exec}: {exec: Exec}): Promise<void> => {
  await exec.run({
    command: `git pull`,
    input: undefined,
  });

}

const setUser = async (
  { exec, name, email }: { exec: Exec; name: string; email: string },
): Promise<void> => {
  await exec.run({
    command: `git config user.name "${name}"`,
    input: undefined,
  });

  await exec.run({
    command: `git config user.email "${email}"`,
    input: undefined,
  });
};

// Squash all commits of a branch into 1 commit
const squash = async (
  { exec, branchToSquash, branchMergingInto, commitTitle, commitMessage }: { exec: Exec; branchToSquash: string; branchMergingInto: string; commitTitle: string; commitMessage: string },
): Promise<void> => {
  // We need to find out how many commits 1 branch is ahead of the other to find out how many unique commits there are. 
  const { stdout } = await exec.run({
    command: `git rev-list --count ${branchMergingInto}..${branchToSquash}`,
    input: undefined,
  });

  const numberOfCommitsAheadOfBranchMergingInto = parseInt(stdout.trim());

  if (numberOfCommitsAheadOfBranchMergingInto === 0) {
    log.message(`Branches ${branchToSquash} and ${branchMergingInto} are already up to date. No commits to squash.`);
    return;
  }

  // Now that we know how many commits are ahead, we can squash all of those commits into 1 commit.
  await exec.run({
    command: `git reset --soft HEAD~${numberOfCommitsAheadOfBranchMergingInto} && git commit -m "${commitTitle}" -m "${commitMessage}"`,
    input: undefined,
  });
}

const rebase = async (
  { exec, branchToRebaseOnto }: { exec: Exec; branchToRebaseOnto: string },
): Promise<void> => {
  await exec.run({
    command: `git rebase ${branchToRebaseOnto}`,
    input: undefined,
  });
};

export const git: Git = {
  add,
  commit,
  push,  
  areAnyFilesStaged,
  deleteBranch,
  checkoutBranch,
  doesLocalBranchExist,
  merge,
  pull,
  setUser,
  squash,
  rebase,
};
