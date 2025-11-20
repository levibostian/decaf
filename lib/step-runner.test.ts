import { exec } from "./exec.ts"
import { Environment } from "./environment.ts"
import { mock, when } from "./mock/mock.ts"
import { StepRunnerImpl } from "./step-runner.ts"
import { assertEquals } from "@std/assert"
import { GetLatestReleaseStepOutput, GetNextReleaseVersionStepOutput } from "./steps/types/output.ts"
import { logger } from "./log.ts"
import { GitCommitFake } from "./types/git.test.ts"
import { DeployStepInput, GetLatestReleaseStepInput, GetNextReleaseVersionStepInput } from "./types/environment.ts"

/**
 * Tests that are common to all steps in StepRunner.
 *
 * More complete tests for the step runner, since all steps share the same logic.
 */

Deno.test("given output is in stdout, expect return latest step", async () => {
  const expect: GetLatestReleaseStepOutput = { versionName: "1.0.0", commitSha: "abc" }

  const environment: Environment = mock()
  when(environment, "getCommandForStep", () => [`echo '${JSON.stringify(expect)}'`])
  const stepRunner = new StepRunnerImpl(environment, exec, logger)

  const testInput: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  }
  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep(testInput)
  assertEquals(actual, expect)
})

Deno.test("given output is in stdout as JSON, expect output is returned", async () => {
  const expect: GetLatestReleaseStepOutput = { versionName: "2.0.0", commitSha: "def" }

  const environment: Environment = mock()
  when(environment, "getCommandForStep", () => [`echo '${JSON.stringify(expect)}'`])
  const exec = { run: () => Promise.resolve({ output: undefined, stdout: JSON.stringify(expect), exitCode: 0 }) }
  const stepRunner = new StepRunnerImpl(environment, exec as unknown as typeof exec, logger)

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep({
    gitCurrentBranch: "main",
    gitRepoOwner: "owner",
    gitRepoName: "repo",
    testMode: false,
    gitCommitsAllLocalBranches: {},
    gitCommitsCurrentBranch: [],
  })
  assertEquals(actual, expect)
})

Deno.test("given no command for step, expect return null", async () => {
  const environment: Environment = mock()
  when(environment, "getCommandForStep", () => undefined)
  const stepRunner = new StepRunnerImpl(environment, exec, logger)

  const testInput: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  }
  assertEquals(null, await stepRunner.runGetLatestOnCurrentBranchReleaseStep(testInput))
})

Deno.test("given output is not valid, expect null is returned", async () => {
  const environment: Environment = mock()
  when(environment, "getCommandForStep", () => [`echo 'not json'`])
  const stepRunner = new StepRunnerImpl(environment, exec, logger)

  const testInput: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  }
  assertEquals(null, await stepRunner.runGetLatestOnCurrentBranchReleaseStep(testInput))
})

Deno.test("supports template engine in command string", async () => {
  const expect: GetLatestReleaseStepOutput & { gitRepo: string } = { versionName: "main", commitSha: "abc123", gitRepo: "owner/repo" }

  // The command string uses template variables from input
  const environment: Environment = mock()
  when(
    environment,
    "getCommandForStep",
    // The real getCommandForStep takes an object: { stepName: AnyStepName }
    // We'll return a template string that uses input.gitCurrentBranch and input.gitRepoOwner
    () => [
      `echo '{"versionName": "{{gitCurrentBranch}}", "gitRepo": "{{gitRepoOwner}}/{{gitRepoName}}", "commitSha": "{{gitCommitsCurrentBranch.0.sha}}" }'`,
    ],
  )
  const stepRunner = new StepRunnerImpl(environment, exec, logger)

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep({
    gitCurrentBranch: "main",
    gitRepoOwner: "owner",
    gitRepoName: "repo",
    testMode: false,
    gitCommitsAllLocalBranches: {
      "branch-1": [
        new GitCommitFake({
          sha: "abc123",
        }),
      ],
      "branch-2": [
        new GitCommitFake({
          sha: "def456",
        }),
      ],
    },
    gitCommitsCurrentBranch: [
      new GitCommitFake({
        sha: "abc123",
      }),
    ],
  })
  assertEquals(actual, expect)
})

/**
 * Tests for specific steps in StepRunner.
 *
 * Testing happy path to verify that we passed in the correct parameters to the step runner logic.
 */

Deno.test("runGetLatestOnCurrentBranchReleaseStep - given return latest release as JSON, expect get version", async () => {
  const expect: GetLatestReleaseStepOutput = { versionName: "1.0.0", commitSha: "abc" }

  const environment: Environment = mock()
  when(environment, "getCommandForStep", (args) => {
    assertEquals(args.stepName, "get_latest_release_current_branch")
    return [`echo '${JSON.stringify(expect)}'`]
  })
  const stepRunner = new StepRunnerImpl(environment, exec, logger)

  const testInput: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  }
  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep(testInput)
  assertEquals(actual, expect)
})

Deno.test("determineNextReleaseVersionStep - given return next release as JSON, expect next release version", async () => {
  const expect: GetNextReleaseVersionStepOutput = { version: "1.2.3" }

  const environment: Environment = mock()
  when(environment, "getCommandForStep", (args) => {
    assertEquals(args.stepName, "get_next_release_version")
    return [`echo '${JSON.stringify(expect)}'`]
  })
  const stepRunner = new StepRunnerImpl(environment, exec, logger)

  const testInput: GetNextReleaseVersionStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
    lastRelease: null,
    gitCommitsSinceLastRelease: [],
  }
  const actual = await stepRunner.determineNextReleaseVersionStep(testInput)
  assertEquals(actual, expect)
})

Deno.test("runDeployStep - given deploy command, expect to run successfully without error", async () => {
  const environment: Environment = mock()
  when(environment, "getCommandForStep", (args) => {
    assertEquals(args.stepName, "deploy")
    return [`echo 'deployment complete'`]
  })
  const stepRunner = new StepRunnerImpl(environment, exec, logger)

  const deployInput: DeployStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "owner",
    gitRepoName: "repo",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
    lastRelease: null,
    gitCommitsSinceLastRelease: [],
    nextVersionName: "1.0.0",
  }

  await stepRunner.runDeployStep(deployInput)
})

/**
 * Tests for multiple command execution.
 */

Deno.test("deploy step runs all commands in order", async () => {
  const executedCommands: string[] = []

  const environment: Environment = mock()
  when(environment, "getCommandForStep", () => ["echo 'first'", "echo 'second'", "echo 'third'"])

  const mockExec = {
    run: (args: { command: string }) => {
      executedCommands.push(args.command)
      return Promise.resolve({ output: undefined, stdout: "", exitCode: 0 })
    },
  }

  const stepRunner = new StepRunnerImpl(environment, mockExec as unknown as typeof exec, logger)

  const deployInput: DeployStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "owner",
    gitRepoName: "repo",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
    lastRelease: null,
    gitCommitsSinceLastRelease: [],
    nextVersionName: "1.0.0",
  }

  await stepRunner.runDeployStep(deployInput)

  // Verify all three commands were executed
  assertEquals(executedCommands.length, 3)
  assertEquals(executedCommands[0], "echo 'first'")
  assertEquals(executedCommands[1], "echo 'second'")
  assertEquals(executedCommands[2], "echo 'third'")
})

Deno.test("non-deploy step returns output from first command with valid output", async () => {
  const firstOutput: GetLatestReleaseStepOutput = { versionName: "1.0.0", commitSha: "abc" }
  const secondOutput: GetLatestReleaseStepOutput = { versionName: "2.0.0", commitSha: "def" }

  const environment: Environment = mock()
  when(environment, "getCommandForStep", () => [
    `echo '${JSON.stringify(firstOutput)}'`,
    `echo '${JSON.stringify(secondOutput)}'`,
  ])

  const executedCommands: string[] = []
  const mockExec = {
    run: (args: { command: string }) => {
      executedCommands.push(args.command)
      // Return the appropriate stdout based on which command is being run
      if (args.command.includes(JSON.stringify(firstOutput))) {
        return Promise.resolve({ output: undefined, stdout: JSON.stringify(firstOutput), exitCode: 0 })
      }
      return Promise.resolve({ output: undefined, stdout: JSON.stringify(secondOutput), exitCode: 0 })
    },
  }

  const stepRunner = new StepRunnerImpl(environment, mockExec as unknown as typeof exec, logger)

  const testInput: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  }

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep(testInput)

  // Should return the first command's output, not the second
  assertEquals(actual, firstOutput)
  // Should have only executed the first command
  assertEquals(executedCommands.length, 1)
})

Deno.test("non-deploy step tries next command if first returns invalid output", async () => {
  const validOutput: GetLatestReleaseStepOutput = { versionName: "2.0.0", commitSha: "def" }

  const executedCommands: string[] = []
  const environment: Environment = mock()
  when(environment, "getCommandsForStep", () => ["echo 'invalid'", `echo '${JSON.stringify(validOutput)}'`])

  const mockExec = {
    run: (args: { command: string }) => {
      executedCommands.push(args.command)
      if (args.command === "echo 'invalid'") {
        return Promise.resolve({ output: undefined, stdout: "invalid", exitCode: 0 })
      }
      return Promise.resolve({ output: validOutput, stdout: "", exitCode: 0 })
    },
  }

  const stepRunner = new StepRunnerImpl(environment, mockExec as unknown as typeof exec, logger)

  const testInput: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  }

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep(testInput)

  // Should have tried both commands
  assertEquals(executedCommands.length, 2)
  // Should return the second command's valid output
  assertEquals(actual, validOutput)
})

Deno.test("non-deploy step returns null if all commands have invalid output", async () => {
  const environment: Environment = mock()
  when(environment, "getCommandForStep", () => ["echo 'invalid1'", "echo 'invalid2'", "echo 'invalid3'"])

  const stepRunner = new StepRunnerImpl(environment, exec, logger)

  const testInput: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  }

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep(testInput)

  // Should return null since no command produced valid output
  assertEquals(actual, null)
})
