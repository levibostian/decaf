import { assertEquals, assertFalse, assertRejects } from "@std/assert"
import { afterEach, before, beforeEach, describe, it } from "@std/testing/bdd"
import { assertSpyCall, restore, Stub, stub } from "@std/testing/mock"
import { exec, RunResult } from "./exec.ts"
import { SimulateMerge, SimulateMergeImpl } from "./simulate-merge.ts"
import { git } from "./git.ts"
import { Exec } from "./exec.ts"
import { assertSnapshot } from "@std/testing/snapshot"

describe("snapshot test all of the merge options", () => {
  let simulateMerge: SimulateMerge
  let execMock: Stub<Exec>

  beforeEach(() => {
    execMock = stub(exec, "run", async (args) => {
      // rev-list expects to return a number of commits
      if (args.command.includes("git rev-list")) {
        return { exitCode: 0, stdout: "3", output: undefined }
      }

      // log expects to return a list of commits
      // I am not the biggest fan of having to do this (I would prefer to mock the git module functions directly), but because we need to capture the git commands being executed, we have to put these mocks here.
      if (args.command.includes("git log")) {
        return {
          exitCode: 0,
          stdout:
            `||f15d5ac43a47b8333019461170fcaf0bd5a139d4|test: update snapshots to remove un-used ones|test: update snapshots to remove un-used ones
|Foo Bar|foo@bar.com|Foo Bar|foo@bar.com|2025-07-09 07:02:35 -0500|2c7e53b35e1b4b278700294b7781d770f16124c8|
0       42      __snapshots__/deploy.test.ts.snap`,
          output: undefined,
        }
      }

      return { exitCode: 0, stdout: "success", output: undefined }
    })
    simulateMerge = new SimulateMergeImpl(git, exec)
  })

  afterEach(() => {
    restore()
  })

  it("merge, should generate the correct git commands, should end on target branch", async (t) => {
    await simulateMerge.performSimulation("merge", {
      baseBranch: "feature",
      targetBranch: "main",
      pullRequestNumber: 123,
      pullRequestTitle: "title-here",
      pullRequestDescription: "message-here",
    })

    await assertSnapshot(t, execMock.calls.map((call) => call.args[0].command))

    assertEndsOnTargetBranch("main")
  })

  it("squash, should generate the correct git commands, should end on target branch", async (t) => {
    await simulateMerge.performSimulation("squash", {
      baseBranch: "feature",
      targetBranch: "main",
      pullRequestNumber: 123,
      pullRequestTitle: "title-here",
      pullRequestDescription: "message-here",
    })

    await assertSnapshot(t, execMock.calls.map((call) => call.args[0].command))

    assertEndsOnTargetBranch("main")
  })

  it("rebase, should generate the correct git commands, should end on target branch", async (t) => {
    await simulateMerge.performSimulation("rebase", {
      baseBranch: "feature",
      targetBranch: "main",
      pullRequestNumber: 123,
      pullRequestTitle: "title-here",
      pullRequestDescription: "message-here",
    })

    await assertSnapshot(t, execMock.calls.map((call) => call.args[0].command))

    assertEndsOnTargetBranch("main")
  })

  const assertEndsOnTargetBranch = (targetBranch: string) => {
    const lastCheckoutCommand = execMock.calls.filter((call) => call.args[0].command.includes("git checkout")).pop()
    assertEquals(lastCheckoutCommand?.args[0].command.includes(targetBranch), true)
  }
})
