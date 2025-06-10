import { assertEquals, assertNotEquals, assertRejects } from "@std/assert"
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd"
import { assertSpyCall, assertSpyCallArg, restore, stub } from "@std/testing/mock"
import { exec } from "../exec.ts"
import { DeployStep, DeployStepImpl } from "./deploy.ts"
import { git } from "../git.ts"
import { GitHubCommit } from "../github-api.ts"
import { DeployStepInput } from "../types/environment.ts"

const defaultEnvironment: DeployStepInput = {
  gitCurrentBranch: "main",
  gitRepoOwner: "owner",
  gitRepoName: "repo",
  gitCommitsSinceLastRelease: [],
  nextVersionName: "1.0.0",
  testMode: true,
  lastRelease: null,
}

describe("run the user given deploy commands", () => {
  afterEach(() => {
    restore()
  })

  it("given list of deploy commands, expect to execute them all", async () => {
    const runStub = stub(exec, "run", async (args) => {
      return {
        exitCode: 0,
        stdout: "success",
        output: undefined,
      }
    })
    stub(git, "areAnyFilesStaged", async (args) => {
      return false
    })

    const commands = [
      "echo 'hello world'",
      "echo 'hello world'",
      "echo 'hello world'",
    ]

    Deno.env.set("INPUT_DEPLOY_COMMANDS", commands.join("\n"))

    await new DeployStepImpl(exec, git).runDeploymentCommands({
      environment: defaultEnvironment,
    })

    assertEquals(runStub.calls.length, 3)
  })

  it("given command as string template, expect execute the command with the environment data", async () => {
    const runStub = stub(exec, "run", async (args) => {
      return {
        exitCode: 0,
        stdout: "success",
        output: undefined,
      }
    })
    stub(git, "areAnyFilesStaged", async (args) => {
      return false
    })

    const commands = [
      "echo 'next version is {{nextVersionName}}'",
    ]

    Deno.env.set("INPUT_DEPLOY_COMMANDS", commands.join("\n"))

    await new DeployStepImpl(exec, git).runDeploymentCommands({
      environment: defaultEnvironment,
    })

    assertEquals(runStub.calls[0].args[0].command, "echo 'next version is 1.0.0'")
  })

  it("given default value of empty string, expect to not run any commands", async () => {
    const runStub = stub(exec, "run", async (args) => {
      return {
        exitCode: 0,
        stdout: "success",
        output: undefined,
      }
    })
    stub(git, "areAnyFilesStaged", async (args) => {
      return false
    })

    Deno.env.set("INPUT_DEPLOY_COMMANDS", "")

    await new DeployStepImpl(exec, git).runDeploymentCommands({
      environment: defaultEnvironment,
    })

    assertEquals(runStub.calls.length, 0)
  })

  it("should return false, given a deploy command fails", async () => {
    stub(exec, "run", async (args) => {
      return {
        exitCode: 1,
        stdout: "error",
        output: undefined,
      }
    })

    const commands = [
      "echo 'hello world'",
      "echo 'hello world'",
      "echo 'hello world'",
    ]

    Deno.env.set("INPUT_DEPLOY_COMMANDS", commands.join("\n"))

    assertRejects(async () => {
      await new DeployStepImpl(exec, git).runDeploymentCommands({
        environment: defaultEnvironment,
      })
    })
  })

  it("should run normally and succeed, given no deploy commands", async () => {
    Deno.env.delete("INPUT_DEPLOY_COMMANDS")

    // Fail if any git commands are run
    stub(exec, "run", async (args) => {
      return {
        exitCode: 1,
        stdout: "error",
        output: undefined,
      }
    })

    stub(git, "areAnyFilesStaged", async (args) => {
      return false
    })

    await new DeployStepImpl(exec, git).runDeploymentCommands({
      environment: defaultEnvironment,
    })
  })

  it("should create a new git branch for deployment given a previously successful deployment", async () => {
    // First, run a successful deployment.
    const { checkoutBranchMock, pushMock } = setupGitStub({ areAnyFilesStaged: true, doesLocalBranchExist: false })

    const givenEnvironmentFirstDeploy = { ...defaultEnvironment, nextVersionName: "1.0.0" }
    await new DeployStepImpl(exec, git).runDeploymentCommands({
      environment: givenEnvironmentFirstDeploy,
    })

    const firstDeploymentGitBranch = checkoutBranchMock.calls[0].args[0].branch
    assertEquals(pushMock.calls[0].args[0].branch, firstDeploymentGitBranch) // verify we push the same branch we checked out

    // Second, run another successful deployment.
    const givenEnvironmentSecondDeploy = { ...defaultEnvironment, nextVersionName: "1.1.0" }
    await new DeployStepImpl(exec, git).runDeploymentCommands({
      environment: givenEnvironmentSecondDeploy,
    })

    const secondDeploymentGitBranch = checkoutBranchMock.calls[1].args[0].branch
    assertEquals(pushMock.calls[1].args[0].branch, secondDeploymentGitBranch) // verify we push the same branch we checked out

    assertNotEquals(firstDeploymentGitBranch, secondDeploymentGitBranch) // verify we use a different branch for the second deployment
  })
})

describe("post deploy commands git operations", () => {
  beforeEach(() => {
    Deno.env.delete("INPUT_DEPLOY_COMMANDS") // deploy commands are not needed for these tests
  })

  afterEach(() => {
    restore()
  })

  it("should not run any git operations if no files have been staged", async () => {
    const { commitMock } = setupGitStub({ areAnyFilesStaged: false, doesLocalBranchExist: true })

    await new DeployStepImpl(exec, git).runDeploymentCommands({
      environment: defaultEnvironment,
    })

    assertEquals(commitMock.calls.length, 0)
  })

  it("should delete local branch if the branch exists", async () => {
    const { deleteBranchMock, doesLocalBranchExistMock } = setupGitStub({ areAnyFilesStaged: true, doesLocalBranchExist: true })

    await new DeployStepImpl(exec, git).runDeploymentCommands({
      environment: defaultEnvironment,
    })

    const gitBranchExpectToDelete = doesLocalBranchExistMock.calls[0].args[0].branch
    assertEquals(deleteBranchMock.calls.length, 1)
    assertEquals(deleteBranchMock.calls[0].args[0].branch, gitBranchExpectToDelete)
  })

  it("should not delete local branch if it does not exist", async () => {
    const { deleteBranchMock } = setupGitStub({ areAnyFilesStaged: true, doesLocalBranchExist: false })

    await new DeployStepImpl(exec, git).runDeploymentCommands({
      environment: defaultEnvironment,
    })

    assertEquals(deleteBranchMock.calls.length, 0)
  })

  it("should checkout, commit, and push if some git files have been staged", async () => {
    const { doesLocalBranchExistMock, commitMock, checkoutBranchMock, pushMock } = setupGitStub({
      areAnyFilesStaged: true,
      doesLocalBranchExist: false,
    })

    await new DeployStepImpl(exec, git).runDeploymentCommands({
      environment: defaultEnvironment,
    })

    assertEquals(checkoutBranchMock.calls.length, 1)

    const gitBranchExpectToCheckoutAndPush = doesLocalBranchExistMock.calls[0].args[0].branch
    assertEquals(checkoutBranchMock.calls[0].args[0].branch, gitBranchExpectToCheckoutAndPush)
    assertEquals(checkoutBranchMock.calls[0].args[0].createBranchIfNotExist, true)

    assertEquals(commitMock.calls.length, 1)

    assertEquals(pushMock.calls.length, 1)
    assertEquals(pushMock.calls[0].args[0].branch, gitBranchExpectToCheckoutAndPush)
    assertEquals(pushMock.calls[0].args[0].forcePush, true)
  })
})

describe("function return values", () => {
  afterEach(() => {
    restore()
  })

  it("should return git commit created, if new commit made", async () => {
    const givenCommitCreated = {
      sha: "123",
      message: "success",
      date: new Date(),
    }

    setupGitStub({ areAnyFilesStaged: true, doesLocalBranchExist: false, gitCommitCreated: givenCommitCreated })

    const commands = [
      "echo 'hello world'",
    ]

    Deno.env.set("INPUT_DEPLOY_COMMANDS", commands.join("\n"))

    assertEquals(
      await new DeployStepImpl(exec, git).runDeploymentCommands({
        environment: defaultEnvironment,
      }),
      givenCommitCreated,
    )
  })

  it("should not return git commit if command fails", async () => {
    stub(exec, "run", async (args) => {
      return {
        exitCode: 1,
        stdout: "error",
        output: undefined,
      }
    })

    const commands = [
      "echo 'hello world'",
    ]

    Deno.env.set("INPUT_DEPLOY_COMMANDS", commands.join("\n"))

    assertRejects(async () => {
      assertEquals(
        await new DeployStepImpl(exec, git).runDeploymentCommands({
          environment: defaultEnvironment,
        }),
        undefined,
      )
    })
  })
})

const setupGitStub = (
  { areAnyFilesStaged, doesLocalBranchExist, gitCommitCreated }: {
    areAnyFilesStaged: boolean
    doesLocalBranchExist: boolean
    gitCommitCreated?: GitHubCommit
  },
) => {
  return {
    areAnyFilesStagedMock: stub(git, "areAnyFilesStaged", async (args) => {
      return areAnyFilesStaged
    }),
    doesLocalBranchExistMock: stub(git, "doesLocalBranchExist", async (args) => {
      return doesLocalBranchExist
    }),
    deleteBranchMock: stub(git, "deleteBranch", async (args) => {
      return
    }),
    checkoutBranchMock: stub(git, "checkoutBranch", async (args) => {
      return
    }),
    commitMock: stub(git, "commit", async (args) => {
      return gitCommitCreated || {
        sha: "123",
        message: "success",
        date: new Date(),
      }
    }),
    pushMock: stub(git, "push", async (args) => {
      return
    }),
  }
}
