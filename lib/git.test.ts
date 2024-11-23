import {
  assertEquals,
  assertFalse,
  assertRejects,
} from "jsr:@std/assert@1";
import { afterEach, describe, it } from "jsr:@std/testing@1/bdd";
import {
  assertSpyCall,
  restore,
  stub,
} from "jsr:@std/testing@1/mock";
import { exec, RunResult } from "./exec.ts";
import { git } from "./git.ts";

describe("add", () => {
  afterEach(() => {
    restore();
  });

  it("should execute the expected command, given a file path", async () => {
    const execMock = stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "success", output: undefined };
    });
    const filePath = "file.txt";

    await git.add({ exec, filePath });

    assertSpyCall(execMock, 0, {
      args: [{ command: `git add file.txt`, input: undefined }],
    });
  });

  it("should throw an error, given the command fails", async () => {
    stub(exec, "run", async (args) => {
      throw new Error("error");
    });

    assertRejects(async () => {
      await git.add({ exec, filePath: "file.txt" });
    }, Error);
  });
});

describe("commit", () => {
  // For creating commits, we pass these environment variables to the command to set the author.
  const expectedEnvVars = {
    GIT_AUTHOR_NAME: "github-actions[bot]",
    GIT_COMMITTER_NAME: "github-actions[bot]",
    GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
    GIT_COMMITTER_EMAIL:
      "41898282+github-actions[bot]@users.noreply.github.com",
  };

  afterEach(() => {
    restore();
  });

  it("should execute the expected command, given a message", async () => {
    const execMock = stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "success", output: undefined };
    });
    const message = "commit message";

    await git.commit({ exec, message, dryRun: false });

    assertSpyCall(execMock, 1, {
      args: [{
        command: `git commit -m "commit message"`,
        input: undefined,
        envVars: expectedEnvVars,
      }],
    });
  });

  it("should throw an error, given the command fails", async () => {
    stub(exec, "run", async (args) => {
      throw new Error("error");
    });

    assertRejects(async () => {
      await git.commit({ exec, message: "commit message", dryRun: false });
    }, Error);
  });

  it("should run command in dry-mode when enabled", async () => {
    const execMock = getExecMock({
      getStagedFilesResult: {
        exitCode: 0,
        stdout: "file.txt\n",
        output: undefined,
      }, // return staged files
      commitReturn: { exitCode: 0, stdout: "", output: undefined },
      getLatestCommitResult: "anyCommit",
    });

    await git.commit({ exec, message: "commit message", dryRun: true });
    assertSpyCall(execMock, 1, {
      args: [{
        command: `git commit -m "commit message" --dry-run`,
        input: undefined,
        envVars: expectedEnvVars,
      }],
    });

    await git.commit({ exec, message: "commit message", dryRun: false });
    assertSpyCall(execMock, 4, {
      args: [{
        command: `git commit -m "commit message"`,
        input: undefined,
        envVars: expectedEnvVars,
      }],
    });
  });

  it("should run commit if files are staged", async () => {
    const execMock = getExecMock({
      getStagedFilesResult: {
        exitCode: 0,
        stdout: "file.txt\n",
        output: undefined,
      }, // return staged files
      commitReturn: { exitCode: 0, stdout: "", output: undefined },
      getLatestCommitResult: "anyCommit",
    });

    await git.commit({ exec, message: "commit message", dryRun: false });

    assertEquals(
      execMock.calls.filter((call) =>
        call.args[0].command.includes("git commit")
      ).length,
      1,
    );
  });

  it("should not run commit if no files are staged", async () => {
    const execMock = getExecMock({
      getStagedFilesResult: { exitCode: 0, stdout: "", output: undefined }, // no staged files
      commitReturn: { exitCode: 0, stdout: "", output: undefined },
      getLatestCommitResult: "anyCommit",
    });

    await git.commit({ exec, message: "commit message", dryRun: false });

    execMock.calls.forEach((call) => {
      assertFalse(call.args[0].command.includes("commit")); // assert no commit command was run
    });
  });

  it("should return the latest commit", async () => {
    const expectedCommit = {
      sha: "a5f75a52fac139f823ccdcb4ea30976e9130ce4d",
      message: "message goes here",
      date: new Date("2024-09-01 07:42:24 -0500"),
    };

    getExecMock({
      getStagedFilesResult: {
        exitCode: 0,
        stdout: "file.txt\n",
        output: undefined,
      },
      commitReturn: { exitCode: 0, stdout: "", output: undefined },
      getLatestCommitResult: {
        exitCode: 0,
        stdout:
          `a5f75a52fac139f823ccdcb4ea30976e9130ce4d\nmessage goes here\n2024-09-01 07:42:24 -0500`,
        output: undefined,
      },
    });

    const actualCommit = await git.commit({
      exec,
      message: "commit message",
      dryRun: false,
    });

    assertEquals(actualCommit, expectedCommit);
  });
});

describe("push", () => {
  afterEach(() => {
    restore();
  });

  it("should execute the expected push command, given a branch", async () => {
    const execMock = stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "success", output: undefined };
    });
    const branch = "foo";

    await git.push({ exec, branch, dryRun: false, forcePush: false });
    assertSpyCall(execMock, 0, {
      args: [{ command: `git push origin foo`, input: undefined }],
    });
  });

  it("should throw an error, given the command fails", async () => {
    stub(exec, "run", async (args) => {
      throw new Error("error");
    });

    assertRejects(async () => {
      await git.push({ exec, branch: "main", dryRun: false, forcePush: false });
    }, Error);
  });

  it("should not run command when dryRun mode enabled", async () => {
    const execMock = stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "success", output: undefined };
    });

    await git.push({ exec, branch: "main", dryRun: true, forcePush: false });

    assertEquals(execMock.calls.length, 0);     
  });

  it("should generate expected git command, given force push", async () => {
    const expectedCommand = `git push origin main --force`;

    const execMock = stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "success", output: undefined };
    });

    await git.push({ exec, branch: "main", dryRun: false, forcePush: true });
    assertSpyCall(execMock, 0, {
      args: [{ command: expectedCommand, input: undefined }],
    });
  });
});

const getExecMock = ({
  getLatestCommitResult,
  getStagedFilesResult,
  commitReturn,
  pushReturn,
}: {
  getLatestCommitResult: RunResult | "anyCommit";
  getStagedFilesResult: RunResult | "noFiles";
  commitReturn?: RunResult;
  pushReturn?: RunResult;
}) => {
  return stub(exec, "run", async (args) => {
    if (args.command.includes("git log")) {
      if (getLatestCommitResult === "anyCommit") {
        return {
          exitCode: 0,
          stdout: `a5f75a52fac\nmessage goes here\n2024-09-01 07:42:24 -0500`,
          output: undefined,
        };
      }

      return getLatestCommitResult;
    }
    if (args.command.includes("git diff")) {
      if (getStagedFilesResult === "noFiles") {
        return { exitCode: 0, stdout: "", output: undefined };
      }

      return getStagedFilesResult;
    }
    if (args.command.includes("git commit")) {
      if (!commitReturn) throw Error("forgot to stub");
      return commitReturn;
    }
    if (args.command.includes("git push")) {
      if (!pushReturn) throw Error("forgot to stub");
      return pushReturn;
    }

    throw Error("unexpected command");
  });
};

describe("areAnyFilesStaged", () => {
  afterEach(() => {
    restore();
  });

  it("should return true, given files are staged", async () => {
    stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "file.txt\n", output: undefined };
    });

    const actual = await git.areAnyFilesStaged({ exec });
    assertEquals(actual, true);
  });

  it("should return false, given no files are staged", async () => {
    stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "", output: undefined };
    });

    const actual = await git.areAnyFilesStaged({ exec });
    assertEquals(actual, false);
  });

  it("should throw an error, given the command fails", async () => {
    stub(exec, "run", async (args) => {
      throw new Error("error");
    });

    assertRejects(async () => {
      await git.areAnyFilesStaged({ exec });
    }, Error);
  });
})

describe("deleteBranch", () => {
  afterEach(() => {
    restore();
  });

  it("should execute the expected command, given a branch", async () => {
    const execMock = stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "success", output: undefined };
    });

    await git.deleteBranch({ exec, branch: "foo", dryRun: false });

    assertSpyCall(execMock, 0, {
      args: [{ command: `git branch -D foo`, input: undefined }],
    });
  });

  it("should throw an error, given the command fails", async () => {
    stub(exec, "run", async (args) => {
      throw new Error("error");
    });

    assertRejects(async () => {
      await git.deleteBranch({ exec, branch: "main", dryRun: false });
    }, Error);
  });

  it("should not run command when dryRun mode enabled", async () => {
    const execMock = stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "success", output: undefined };
    });

    await git.deleteBranch({ exec, branch: "main", dryRun: true });

    assertEquals(execMock.calls.length, 0);     
  })
})

describe("checkoutBranch", () => {
  afterEach(() => {
    restore();
  });

  it("should execute the expected command", async () => {
    const execMock = stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "success", output: undefined };
    });

    await git.checkoutBranch({ exec, branch: "main", createBranchIfNotExist: false });

    assertSpyCall(execMock, 0, {
      args: [{ command: `git checkout main`, input: undefined }],
    });

    // Now, test with createBranchIfNotExist
    await git.checkoutBranch({ exec, branch: "main", createBranchIfNotExist: true });

    assertSpyCall(execMock, 1, {
      args: [{ command: `git checkout -b main`, input: undefined }],
    });
  });

  it("should throw an error, given the command fails", async () => {
    stub(exec, "run", async (args) => {
      throw new Error("error");
    });

    assertRejects(async () => {
      await git.checkoutBranch({ exec, branch: "main", createBranchIfNotExist: false });
    }, Error);
  });
})

describe("doesLocalBranchExist", () => {
  afterEach(() => {
    restore();
  });

  it("should return true, given the branch exists", async () => {
    stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "", output: undefined };
    });

    const actual = await git.doesLocalBranchExist({ exec, branch: "main" });
    assertEquals(actual, true);
  });

  it("should return false, given the branch does not exist", async () => {
    stub(exec, "run", async (args) => {
      return { exitCode: 1, stdout: "", output: undefined };
    });

    const actual = await git.doesLocalBranchExist({ exec, branch: "main" });
    assertEquals(actual, false);
  });
})
