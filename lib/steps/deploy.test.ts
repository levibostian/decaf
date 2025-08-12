import { assertEquals, assertRejects } from "@std/assert"
import { afterEach, describe, it } from "@std/testing/bdd"
import { restore, stub } from "@std/testing/mock"
import { exec } from "../exec.ts"
import { DeployStepImpl } from "./deploy.ts"
import { DeployStepInput } from "../types/environment.ts"

const defaultEnvironment: DeployStepInput = {
  gitCurrentBranch: "main",
  gitRepoOwner: "owner",
  gitRepoName: "repo",
  gitCommitsSinceLastRelease: [],
  nextVersionName: "1.0.0",
  testMode: true,
  lastRelease: null,
  gitCommitsAllLocalBranches: {},
  gitCommitsCurrentBranch: [],
}

describe("run the user given deploy commands", () => {
  afterEach(() => {
    restore()
  })

  it("given command as string template, expect execute the command with the environment data", async () => {
    const runStub = stub(exec, "run", async (args) => {
      return {
        exitCode: 0,
        stdout: "success",
        output: undefined,
      }
    })

    const command = "echo 'next version is {{nextVersionName}}'"

    Deno.env.set("INPUT_DEPLOY", command)

    await new DeployStepImpl(exec).runDeploymentCommands({
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

    Deno.env.set("INPUT_DEPLOY", "")

    await new DeployStepImpl(exec).runDeploymentCommands({
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

    const command = "echo 'hello world'"

    Deno.env.set("INPUT_DEPLOY", command)

    await assertRejects(async () => {
      await new DeployStepImpl(exec).runDeploymentCommands({
        environment: defaultEnvironment,
      })
    })
  })

  it("should run normally and succeed, given no deploy command", async () => {
    Deno.env.delete("INPUT_DEPLOY")

    // Fail if any git commands are run
    stub(exec, "run", async (args) => {
      return {
        exitCode: 1,
        stdout: "error",
        output: undefined,
      }
    })

    await new DeployStepImpl(exec).runDeploymentCommands({
      environment: defaultEnvironment,
    })
  })
})
