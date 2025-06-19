import { Exec, exec } from "./exec.ts"
import { GitHubActions } from "./github-actions.ts"
import { mock, when } from "./mock/mock.ts"
import { StepRunnerImpl } from "./step-runner.ts"
import { assertEquals } from "@std/assert"
import { GetLatestReleaseStepOutput, GetNextReleaseVersionStepOutput } from "./steps/types/output.ts"
import { logger } from "./log.ts"

/**
 * Tests that are common to all steps in StepRunner.
 *
 * More complete tests for the step runner, since all steps share the same logic.
 */

Deno.test("given output is in stdout, expect return latest step", async () => {
  const expect: GetLatestReleaseStepOutput = { versionName: "1.0.0", commitSha: "abc" }

  const githubActions: GitHubActions = mock()
  when(githubActions, "getCommandForStep", () => `echo '${JSON.stringify(expect)}'`)
  const stepRunner = new StepRunnerImpl(githubActions, exec, logger)

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep({} as any)
  assertEquals(actual, expect)
})

Deno.test("given output is in stdout as JSON, expect output is returned", async () => {
  const expect: GetLatestReleaseStepOutput = { versionName: "2.0.0", commitSha: "def" }

  const githubActions: GitHubActions = mock()
  when(githubActions, "getCommandForStep", () => `echo '${JSON.stringify(expect)}'`)
  const exec = { run: () => Promise.resolve({ output: undefined, stdout: JSON.stringify(expect), exitCode: 0 }) }
  const stepRunner = new StepRunnerImpl(githubActions, exec as unknown as typeof exec, logger)

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep({
    gitCurrentBranch: "main",
    gitRepoOwner: "owner",
    gitRepoName: "repo",
    testMode: false,
  })
  assertEquals(actual, expect)
})

Deno.test("given no command for step, expect return null", async () => {
  const githubActions: GitHubActions = mock()
  when(githubActions, "getCommandForStep", () => undefined)
  const stepRunner = new StepRunnerImpl(githubActions, exec, logger)

  assertEquals(null, await stepRunner.runGetLatestOnCurrentBranchReleaseStep({} as any))
})

Deno.test("given output is not valid, expect null is returned", async () => {
  const githubActions: GitHubActions = mock()
  when(githubActions, "getCommandForStep", () => `echo 'not json'`)
  const stepRunner = new StepRunnerImpl(githubActions, exec, logger)

  assertEquals(null, await stepRunner.runGetLatestOnCurrentBranchReleaseStep({} as any))
})

Deno.test("supports template engine in command string", async () => {
  const expect: GetLatestReleaseStepOutput = { versionName: "main", commitSha: "owner" }

  // The command string uses template variables from input
  const githubActions: GitHubActions = mock()
  when(
    githubActions,
    "getCommandForStep",
    // The real getCommandForStep takes an object: { stepName: AnyStepName }
    // We'll return a template string that uses input.gitCurrentBranch and input.gitRepoOwner
    () => `echo '{"versionName": "{{gitCurrentBranch}}", "commitSha": "{{gitRepoOwner}}"}'`,
  )
  const stepRunner = new StepRunnerImpl(githubActions, exec, logger)

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep({
    gitCurrentBranch: "main",
    gitRepoOwner: "owner",
    gitRepoName: "repo",
    testMode: false,
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

  const githubActions: GitHubActions = mock()
  when(githubActions, "getCommandForStep", (args) => {
    assertEquals(args.stepName, "get_latest_release_current_branch")
    return `echo '${JSON.stringify(expect)}'`
  })
  const stepRunner = new StepRunnerImpl(githubActions, exec, logger)

  const actual = await stepRunner.runGetLatestOnCurrentBranchReleaseStep({} as any)
  assertEquals(actual, expect)
})

Deno.test("determineNextReleaseVersionStep - given return next release as JSON, expect next release version", async () => {
  const expect: GetNextReleaseVersionStepOutput = { version: "1.2.3" }

  const githubActions: GitHubActions = mock()
  when(githubActions, "getCommandForStep", (args) => {
    assertEquals(args.stepName, "get_next_release_version")
    return `echo '${JSON.stringify(expect)}'`
  })
  const stepRunner = new StepRunnerImpl(githubActions, exec, logger)

  const actual = await stepRunner.determineNextReleaseVersionStep({} as any)
  assertEquals(actual, expect)
})
