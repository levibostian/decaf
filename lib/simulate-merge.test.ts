import { assertEquals } from "@std/assert"
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd"
import { assertSpyCall, restore, Stub, stub } from "@std/testing/mock"
import { exec } from "./exec.ts"
import { SimulateMerge, SimulateMergeImpl } from "./simulate-merge.ts"
import * as gitModule from "./git.ts"
import { Exec } from "./exec.ts"
import { assertSnapshot } from "@std/testing/snapshot"
import { GitCommit } from "./types/git.ts"
import { GitCommitFake } from "./types/git.test.ts"
import { mock, when } from "./mock/mock.ts"

let git: gitModule.Git
Deno.test.beforeEach(() => {
  git = gitModule.impl()
})

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
            `[[⬛]]f15d5ac43a47b8333019461170fcaf0bd5a139d4[⬛]test: update snapshots to remove un-used ones[⬛]test: update snapshots to remove un-used ones
[⬛]Foo Bar[⬛]foo@bar.com[⬛]Foo Bar[⬛]foo@bar.com[⬛]2025-07-09 07:02:35 -0500[⬛]2c7e53b35e1b4b278700294b7781d770f16124c8[⬛]
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
      pullRequestTitle: "title here",
      pullRequestDescription: "message here, with $special characters! and \"quotes\" 'too'",
    })

    await assertSnapshot(t, execMock.calls.map((call) => call.args[0].command))

    assertEndsOnTargetBranch("main")
  })

  it("squash, should generate the correct git commands, should end on target branch", async (t) => {
    await simulateMerge.performSimulation("squash", {
      baseBranch: "feature",
      targetBranch: "main",
      pullRequestNumber: 123,
      pullRequestTitle: "title here",
      pullRequestDescription: "message here, with $special characters! and \"quotes\" 'too'",
    })

    await assertSnapshot(t, execMock.calls.map((call) => call.args[0].command))

    assertEndsOnTargetBranch("main")
  })

  it("rebase, should generate the correct git commands, should end on target branch", async (t) => {
    await simulateMerge.performSimulation("rebase", {
      baseBranch: "feature",
      targetBranch: "main",
      pullRequestNumber: 123,
      pullRequestTitle: "title here",
      pullRequestDescription: "message here, with $special characters! and \"quotes\" 'too'",
    })

    await assertSnapshot(t, execMock.calls.map((call) => call.args[0].command))

    assertEndsOnTargetBranch("main")
  })

  const assertEndsOnTargetBranch = (targetBranch: string) => {
    const lastCheckoutCommand = execMock.calls.filter((call) => call.args[0].command.includes("git checkout")).pop()
    assertEquals(lastCheckoutCommand?.args[0].command.includes(targetBranch), true)
  }
})

describe("unit tests for commits returned by simulation methods", () => {
  let simulateMerge: SimulateMerge
  let git: gitModule.Git

  // Setup for unit testing with git module mocks (not exec mocks)
  const setupUnitTest = () => {
    restore() // Clear any existing mocks

    // Mock exec module too to prevent actual git commands
    when(exec, "run", () => {
      throw Error("should not run")
    })

    git = mock()
    simulateMerge = new SimulateMergeImpl(git, exec)
  }

  // Helper to create a mock commit
  const createMockCommit = (sha: string, title: string): GitCommit => new GitCommitFake({ sha, title })

  afterEach(() => {
    restore()
  })

  describe("merge method", () => {
    it("should return only commits created during merge when target branch has existing commits", async () => {
      setupUnitTest()

      const existingCommit = createMockCommit("existing123", "existing commit")
      const newCommit1 = createMockCommit("merge456", "merge commit 1")
      const newCommit2 = createMockCommit("merge789", "merge commit 2")

      // Mock git functions
      const _getLatestCommitOnBranchStub = when(git, "getLatestCommitOnBranch", () => Promise.resolve(existingCommit))
      const getLatestCommitsSinceStub = when(git, "getLatestCommitsSince", () => Promise.resolve([newCommit1, newCommit2]))

      const result = await simulateMerge.merge({
        baseBranch: "feature",
        targetBranch: "main",
        commitTitle: "Merge feature into main",
        commitMessage: "Merge description",
      })

      // Should return only commits created during the simulation
      assertEquals(result, [newCommit1, newCommit2])

      // Verify getLatestCommitsSince was called with the existing commit as reference
      assertSpyCall(getLatestCommitsSinceStub, 0, {
        args: [{ exec, commit: existingCommit, cwd: undefined }],
      })
    })

    it("should return all commits when target branch was empty (no reference commit)", async () => {
      setupUnitTest()

      const newCommit1 = createMockCommit("merge456", "merge commit 1")
      const newCommit2 = createMockCommit("merge789", "merge commit 2")

      // Mock git functions
      const _getLatestCommitOnBranchStub = when(git, "getLatestCommitOnBranch", () => Promise.resolve(undefined))
      const getCommitsStub = when(git, "getCommits", () => Promise.resolve([newCommit1, newCommit2]))

      const result = await simulateMerge.merge({
        baseBranch: "feature",
        targetBranch: "main",
        commitTitle: "Merge feature into main",
        commitMessage: "Merge description",
      })

      // Should return all commits since the target branch was empty
      assertEquals(result, [newCommit1, newCommit2])

      // Verify getCommits was called instead of getLatestCommitsSince
      assertSpyCall(getCommitsStub, 0, {
        args: [{ exec, branch: { ref: "main" }, cwd: undefined }],
      })
    })
  })

  describe("squash method", () => {
    it("should return only commits created during squash when target branch has existing commits", async () => {
      setupUnitTest()

      const existingCommit = createMockCommit("existing123", "existing commit")
      const squashCommit = createMockCommit("squash456", "squashed commit")

      // Mock git functions
      const _getLatestCommitOnBranchStub = when(git, "getLatestCommitOnBranch", () => Promise.resolve(existingCommit))
      const getLatestCommitsSinceStub = when(git, "getLatestCommitsSince", () => Promise.resolve([squashCommit]))

      const result = await simulateMerge.squash({
        baseBranch: "feature",
        targetBranch: "main",
        commitTitle: "feat: squashed feature",
        commitMessage: "Squashed multiple commits into one",
      })

      // Should return only the squash commit created during the simulation
      assertEquals(result, [squashCommit])

      // Verify getLatestCommitsSince was called with the existing commit as reference
      assertSpyCall(getLatestCommitsSinceStub, 0, {
        args: [{ exec, commit: existingCommit, cwd: undefined }],
      })
    })

    it("should return all commits when target branch was empty (no reference commit)", async () => {
      setupUnitTest()

      const squashCommit = createMockCommit("squash456", "squashed commit")

      // Mock git functions
      const _getLatestCommitOnBranchStub = when(git, "getLatestCommitOnBranch", () => Promise.resolve(undefined))
      const getCommitsStub = when(git, "getCommits", () => Promise.resolve([squashCommit]))

      const result = await simulateMerge.squash({
        baseBranch: "feature",
        targetBranch: "main",
        commitTitle: "feat: squashed feature",
        commitMessage: "Squashed multiple commits into one",
      })

      // Should return the squash commit since the target branch was empty
      assertEquals(result, [squashCommit])

      // Verify getCommits was called instead of getLatestCommitsSince
      assertSpyCall(getCommitsStub, 0, {
        args: [{ exec, branch: { ref: "main" }, cwd: undefined }],
      })
    })
  })

  describe("rebase method", () => {
    it("should return only commits created during rebase when target branch has existing commits", async () => {
      setupUnitTest()

      const existingCommit = createMockCommit("existing123", "existing commit")
      const rebaseCommit1 = createMockCommit("rebase456", "rebased commit 1")
      const rebaseCommit2 = createMockCommit("rebase789", "rebased commit 2")

      // Mock git functions
      const _getLatestCommitOnBranchStub = when(git, "getLatestCommitOnBranch", () => Promise.resolve(existingCommit))
      const getLatestCommitsSinceStub = when(git, "getLatestCommitsSince", () => Promise.resolve([rebaseCommit1, rebaseCommit2]))

      const result = await simulateMerge.rebase({
        baseBranch: "feature",
        targetBranch: "main",
        commitTitle: "feat: feature title",
        commitMessage: "Feature description",
      })

      // Should return only commits created during the rebase simulation
      assertEquals(result, [rebaseCommit1, rebaseCommit2])

      // Verify getLatestCommitsSince was called with the existing commit as reference
      assertSpyCall(getLatestCommitsSinceStub, 0, {
        args: [{ exec, commit: existingCommit, cwd: undefined }],
      })
    })

    it("should return all commits when target branch was empty (no reference commit)", async () => {
      setupUnitTest()

      const rebaseCommit1 = createMockCommit("rebase456", "rebased commit 1")
      const rebaseCommit2 = createMockCommit("rebase789", "rebased commit 2")

      // Mock git functions
      const _getLatestCommitOnBranchStub = when(git, "getLatestCommitOnBranch", () => Promise.resolve(undefined))
      const getCommitsStub = when(git, "getCommits", () => Promise.resolve([rebaseCommit1, rebaseCommit2]))

      const result = await simulateMerge.rebase({
        baseBranch: "feature",
        targetBranch: "main",
        commitTitle: "feat: feature title",
        commitMessage: "Feature description",
      })

      // Should return all rebased commits since the target branch was empty
      assertEquals(result, [rebaseCommit1, rebaseCommit2])

      // Verify getCommits was called instead of getLatestCommitsSince
      assertSpyCall(getCommitsStub, 0, {
        args: [{ exec, branch: { ref: "main" }, cwd: undefined }],
      })
    })
  })
})
