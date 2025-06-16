import { assertEquals, assertRejects } from "@std/assert"
import { afterEach, describe, it } from "@std/testing/bdd"
import { assertSpyCall, restore, stub } from "@std/testing/mock"
import { exec } from "./exec.ts"
import { git } from "./git.ts"

describe("checkoutBranch", () => {
  afterEach(() => {
    restore()
  })

  it("should execute the expected command", async () => {
    const execMock = stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "success", output: undefined }
    })

    await git.checkoutBranch({ exec, branch: "main", createBranchIfNotExist: false })

    assertSpyCall(execMock, 0, {
      args: [{ command: `git checkout main`, input: undefined }],
    })

    // Now, test with createBranchIfNotExist
    await git.checkoutBranch({ exec, branch: "main", createBranchIfNotExist: true })

    assertSpyCall(execMock, 1, {
      args: [{ command: `git checkout -b main`, input: undefined }],
    })
  })

  it("should throw an error, given the command fails", async () => {
    stub(exec, "run", async (args) => {
      throw new Error("error")
    })

    assertRejects(async () => {
      await git.checkoutBranch({ exec, branch: "main", createBranchIfNotExist: false })
    }, Error)
  })
})

describe("createLocalBranchFromRemote", () => {
  afterEach(() => {
    restore()
  })

  it("should execute the expected commands, given a branch", async () => {
    const execMock = stub(exec, "run", async (args) => {
      if (args.command.includes("--show-current")) {
        return { exitCode: 0, stdout: "branch-im-on", output: undefined }
      }

      return { exitCode: 0, stdout: "", output: undefined }
    })

    await git.createLocalBranchFromRemote({ exec, branch: "branch-to-pull" })

    assertEquals(execMock.calls.map((call) => call.args[0].command), [
      "git branch --show-current",
      "git fetch origin",
      "git branch --track branch-to-pull origin/branch-to-pull",
      "git checkout branch-to-pull",
      "git pull --no-rebase origin branch-to-pull",
      "git checkout branch-im-on",
    ])
  })

  it("should throw an error, given a command fails", async () => {
    stub(exec, "run", async (args) => {
      throw new Error("")
    })

    assertRejects(async () => {
      await git.createLocalBranchFromRemote({ exec, branch: "main" })
    }, Error)
  })
})
