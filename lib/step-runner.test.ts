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
  when(environment, "getCommandsForStep", () => [`echo '${JSON.stringify(expect)}'`])
  const stepRunner = new StepRunnerImpl({
    environment,
    exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

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
  when(environment, "getCommandsForStep", () => [`echo '${JSON.stringify(expect)}'`])
  const exec = { run: () => Promise.resolve({ output: undefined, stdout: JSON.stringify(expect), stderr: "", exitCode: 0 }) }
  const stepRunner = new StepRunnerImpl({
    environment,
    exec: exec as unknown as typeof exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

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
  when(environment, "getCommandsForStep", () => undefined)
  const stepRunner = new StepRunnerImpl({
    environment,
    exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

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
  when(environment, "getCommandsForStep", () => [`echo 'not json'`])
  const stepRunner = new StepRunnerImpl({
    environment,
    exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

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
    "getCommandsForStep",
    // The real getCommandsForStep takes an object: { stepName: AnyStepName }
    // We'll return a template string that uses input.gitCurrentBranch and input.gitRepoOwner
    () => [
      `echo '{"versionName": "{{gitCurrentBranch}}", "gitRepo": "{{gitRepoOwner}}/{{gitRepoName}}", "commitSha": "{{gitCommitsCurrentBranch[0].sha}}" }'`,
    ],
  )
  const stepRunner = new StepRunnerImpl({
    environment,
    exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

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
  when(environment, "getCommandsForStep", (args) => {
    assertEquals(args.stepName, "get_latest_release_current_branch")
    return [`echo '${JSON.stringify(expect)}'`]
  })
  const stepRunner = new StepRunnerImpl({
    environment,
    exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

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
  when(environment, "getCommandsForStep", (args) => {
    assertEquals(args.stepName, "get_next_release_version")
    return [`echo '${JSON.stringify(expect)}'`]
  })
  const stepRunner = new StepRunnerImpl({
    environment,
    exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

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
  when(environment, "getCommandsForStep", (args) => {
    assertEquals(args.stepName, "deploy")
    return [`echo 'deployment complete'`]
  })
  const stepRunner = new StepRunnerImpl({
    environment,
    exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

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
  when(environment, "getCommandsForStep", () => ["echo 'first'", "echo 'second'", "echo 'third'"])

  const mockExec = {
    run: (args: { command: string }) => {
      executedCommands.push(args.command)
      return Promise.resolve({ output: undefined, stdout: "", stderr: "", exitCode: 0 })
    },
  }

  const stepRunner = new StepRunnerImpl({
    environment,
    exec: mockExec as unknown as typeof exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

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

Deno.test("non-deploy step runs all commands and does not exit early", async () => {
  const firstOutput: GetLatestReleaseStepOutput = { versionName: "1.0.0", commitSha: "abc" }
  const secondOutput: GetLatestReleaseStepOutput = { versionName: "2.0.0", commitSha: "def" }

  const environment: Environment = mock()
  when(environment, "getCommandsForStep", () => [
    `echo '${JSON.stringify(firstOutput)}'`,
    `echo '${JSON.stringify(secondOutput)}'`,
  ])

  const executedCommands: string[] = []
  const mockExec = {
    run: (args: { command: string }) => {
      executedCommands.push(args.command)
      if (args.command.includes(JSON.stringify(firstOutput))) {
        return Promise.resolve({ output: firstOutput, stdout: "", stderr: "", exitCode: 0 })
      }
      return Promise.resolve({ output: secondOutput, stdout: "", stderr: "", exitCode: 0 })
    },
  }

  const stepRunner = new StepRunnerImpl({
    environment,
    exec: mockExec as unknown as typeof exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

  const testInput: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  }

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep(testInput)

  // Should have executed both commands, even though the first command produced valid output.
  // We make sure we don't exit early.
  assertEquals(executedCommands.length, 2)
  // Final result is the merged output of all scripts (last script's output wins on conflicts)
  assertEquals(actual, secondOutput)
})

Deno.test("scripts cumulatively merge all outputs so each script builds on all previous ones", async () => {
  // Script 1 outputs a complete valid object — it gets accumulated.
  // Scripts 2 output incomplete objects (missing versionName) — it is ignored.
  // Only complete, valid outputs are passed forward via previousScriptsOutput.
  const script1Output = { versionName: "1.0.0", commitSha: "from-script-1", extraFieldA: "from-script-1" }
  const script2Output = { commitSha: "from-script-2", extraFieldB: "from-script-2" } // incomplete — no versionName
  const script3Output = { versionName: "1.0.0", commitSha: "final" }

  const environment: Environment = mock()
  when(environment, "getCommandsForStep", () => ["script1", "script2", "script3"])

  const capturedInputs: GetLatestReleaseStepInput[] = []
  const mockExec = {
    run: (args: { command: string; input: GetLatestReleaseStepInput }) => {
      capturedInputs.push(args.input)
      if (args.command === "script1") return Promise.resolve({ output: script1Output, stdout: "", stderr: "", exitCode: 0 })
      if (args.command === "script2") return Promise.resolve({ output: script2Output, stdout: "", stderr: "", exitCode: 0 })
      return Promise.resolve({ output: script3Output, stdout: "", stderr: "", exitCode: 0 })
    },
  }

  const stepRunner = new StepRunnerImpl({
    environment,
    exec: mockExec as unknown as typeof exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

  const testInput: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  }

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep(testInput)

  assertEquals(capturedInputs, [
    { ...testInput, previousScriptsOutput: undefined }, // first script: only get the test input, nothing from previous scripts
    { ...testInput, previousScriptsOutput: script1Output }, // second script sees script 1's valid output
    { ...testInput, previousScriptsOutput: script1Output }, // third script: script 2 was incomplete, still just script 1
  ])

  // Final result is the cumulative merge of all valid outputs — only script 1 qualified
  assertEquals(actual as GetLatestReleaseStepOutput & { extraFieldA: string }, {
    versionName: "1.0.0",
    commitSha: "final",
    extraFieldA: "from-script-1",
  })
})

Deno.test("multiple scripts not able to override input data provided by decaf", async () => {
  // Script 1 outputs a complete valid object — it gets accumulated.
  // Scripts 2 output incomplete objects (missing versionName) — it is ignored.
  // Only complete, valid outputs are passed forward via previousScriptsOutput.
  const script1Output = { versionName: "1.0.0", commitSha: "from-script-1", gitRepoOwner: "malicious-attempt-to-override-decaf-input" }
  const script2Output = {}

  const environment: Environment = mock()
  when(environment, "getCommandsForStep", () => ["script1", "script2"])

  const capturedInputs: GetLatestReleaseStepInput[] = []
  const mockExec = {
    run: (args: { command: string; input: GetLatestReleaseStepInput }) => {
      capturedInputs.push(args.input)
      if (args.command === "script1") return Promise.resolve({ output: script1Output, stdout: "", stderr: "", exitCode: 0 })
      return Promise.resolve({ output: script2Output, stdout: "", stderr: "", exitCode: 0 })
    },
  }

  const stepRunner = new StepRunnerImpl({
    environment,
    exec: mockExec as unknown as typeof exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

  const testInput: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  }

  await stepRunner.runGetLatestOnCurrentBranchReleaseStep(testInput)

  assertEquals(capturedInputs, [
    { ...testInput, previousScriptsOutput: undefined }, // first script: only get the test input, nothing from previous scripts
    { ...testInput, previousScriptsOutput: script1Output }, // most important thing here is that testInput is intact.
  ])
})

Deno.test("non-deploy step returns null if all commands have invalid output", async () => {
  const environment: Environment = mock()
  when(environment, "getCommandsForStep", () => ["echo 'invalid1'", "echo 'invalid2'", "echo 'invalid3'"])

  const stepRunner = new StepRunnerImpl({
    environment,
    exec,
    logger,
    gitRootDirectory: Deno.cwd(),
    userScriptCurrentWorkingDirectory: Deno.cwd(),
  })

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

/**
 * Tests for working directory behavior.
 */

Deno.test("all step runner methods run commands from user script working directory and set DECAF_ROOT_WORKING_DIRECTORY env var", async () => {
  const testGitRootDirectory = "/test/git/root"
  const testUserScriptWorkingDirectory = "/test/git/root/subdirectory"
  const getLatestReleaseOutput: GetLatestReleaseStepOutput = { versionName: "1.0.0", commitSha: "abc" }
  const getNextVersionOutput: GetNextReleaseVersionStepOutput = { version: "2.0.0" }

  const capturedCalls: Array<{ command: string; workingDirectory: string | undefined; envVars?: { [key: string]: string } }> = []

  const environment: Environment = mock()
  when(environment, "getCommandsForStep", (_args) => {
    return ["echo 'foo'"]
  })

  const mockExec = {
    run: (args: { command: string; currentWorkingDirectory?: string; envVars?: { [key: string]: string } }) => {
      capturedCalls.push({ command: args.command, workingDirectory: args.currentWorkingDirectory, envVars: args.envVars })

      if (args.command.includes(JSON.stringify(getLatestReleaseOutput))) {
        return Promise.resolve({ output: undefined, stdout: JSON.stringify(getLatestReleaseOutput), stderr: "", exitCode: 0 })
      }
      if (args.command.includes(JSON.stringify(getNextVersionOutput))) {
        return Promise.resolve({ output: undefined, stdout: JSON.stringify(getNextVersionOutput), stderr: "", exitCode: 0 })
      }
      return Promise.resolve({ output: undefined, stdout: "", stderr: "", exitCode: 0 })
    },
  }

  const stepRunner = new StepRunnerImpl({
    environment,
    exec: mockExec as unknown as typeof exec,
    logger,
    gitRootDirectory: testGitRootDirectory,
    userScriptCurrentWorkingDirectory: testUserScriptWorkingDirectory,
  })

  // Run all three public step methods
  await stepRunner.runGetLatestOnCurrentBranchReleaseStep({
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  })

  await stepRunner.determineNextReleaseVersionStep({
    gitCurrentBranch: "main",
    gitRepoOwner: "test",
    gitRepoName: "test",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
    lastRelease: null,
    gitCommitsSinceLastRelease: [],
  })

  await stepRunner.runDeployStep({
    gitCurrentBranch: "main",
    gitRepoOwner: "owner",
    gitRepoName: "repo",
    testMode: false,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
    lastRelease: null,
    gitCommitsSinceLastRelease: [],
    nextVersionName: "2.0.0",
  })

  // Verify we ran three different commands
  assertEquals(capturedCalls.length, 3, "should have run three commands")

  // Verify all three commands ran from the user script working directory
  assertEquals(
    capturedCalls[0].workingDirectory,
    testUserScriptWorkingDirectory,
    "runGetLatestOnCurrentBranchReleaseStep should run from user script working directory",
  )
  assertEquals(
    capturedCalls[1].workingDirectory,
    testUserScriptWorkingDirectory,
    "determineNextReleaseVersionStep should run from user script working directory",
  )
  assertEquals(capturedCalls[2].workingDirectory, testUserScriptWorkingDirectory, "runDeployStep should run from user script working directory")

  // Verify all three commands received DECAF_ROOT_WORKING_DIRECTORY env var with correct value
  assertEquals(
    capturedCalls[0].envVars?.DECAF_ROOT_WORKING_DIRECTORY,
    testGitRootDirectory,
    "runGetLatestOnCurrentBranchReleaseStep should pass DECAF_ROOT_WORKING_DIRECTORY env var",
  )
  assertEquals(
    capturedCalls[1].envVars?.DECAF_ROOT_WORKING_DIRECTORY,
    testGitRootDirectory,
    "determineNextReleaseVersionStep should pass DECAF_ROOT_WORKING_DIRECTORY env var",
  )
  assertEquals(
    capturedCalls[2].envVars?.DECAF_ROOT_WORKING_DIRECTORY,
    testGitRootDirectory,
    "runDeployStep should pass DECAF_ROOT_WORKING_DIRECTORY env var",
  )
})
