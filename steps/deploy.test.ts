/**
 * automated tests for the steps/deploy.ts file.
 *
 * Note: The deploy.ts script is complex and uses @david/dax to execute many shell commands.
 * We use mock-a-bin to mock external commands like git to avoid needing a real git repository.
 * Some tests may take longer as they allow real deno compilation to happen.
 */

// deno-lint-ignore-file no-import-prefix
import { mockBin } from "jsr:@levibostian/mock-a-bin@1.0.0"
import { arrayDifferences, getCommandsExecuted, runScript } from "./test-sdk.test.ts"
import { assertArrayIncludes, assertEquals, assertStringIncludes } from "@std/assert"
import { DeployStepInput } from "../lib/types/environment.ts"
import { GitCommit } from "../lib/types/git.ts"
import { $ } from "@david/dax"
import { afterEach } from "@std/testing/bdd"
import { assertSnapshot } from "@std/testing/snapshot"

afterEach(async () => {
  // reset files that are modified in tests to create a clean state for each test
  await $`git restore version.txt`.noThrow()
  await $`rm -rf dist`.noThrow()
})

// Helper to create a minimal GitCommit object for testing
const createTestCommit = (sha: string, message: string): GitCommit => ({
  sha,
  abbreviatedSha: sha.substring(0, 7),
  title: message,
  message,
  messageLines: [message],
  author: { name: "Test Author", email: "test@example.com" },
  committer: { name: "Test Committer", email: "test@example.com" },
  date: new Date("2025-01-01"),
  filesChanged: [],
  isMergeCommit: false,
  isRevertCommit: false,
  parents: [],
})

// Helper to create a minimal valid input for deploy
const getScriptInput = (nextVersionName: string, testMode = false): DeployStepInput => {
  const commit = createTestCommit("abc123", "feat: test commit")
  return {
    gitCurrentBranch: "main",
    gitRepoOwner: "test-owner",
    gitRepoName: "test-repo",
    testMode,
    gitCommitsCurrentBranch: [commit],
    gitCommitsAllLocalBranches: {
      "main": [commit],
      "latest": [commit],
    },
    lastRelease: null,
    gitCommitsSinceLastRelease: [commit],
    nextVersionName,
  }
}

Deno.test("assert differences between test mode and production mode.", async () => {
  await mockBin(
    "git",
    "#!/usr/bin/env -S deno run --quiet --allow-all",
    `
const args = Deno.args;
const command = args[0];
`,
  )

  const version = "1.0.0"

  // Run in test mode
  const testResult = await runScript<DeployStepInput, void>("deno run --allow-all steps/deploy.ts", getScriptInput(version, true))
  assertEquals(testResult.code, 0, "Test mode should succeed")
  const commandsExecutedInTestMode = getCommandsExecuted(testResult.stdout)

  // Run in production mode
  const prodResult = await runScript<DeployStepInput, void>("deno run --allow-all steps/deploy.ts", getScriptInput(version, false))
  assertEquals(prodResult.code, 0, "Production mode should succeed")
  const commandsExecutedInProdMode = getCommandsExecuted(prodResult.stdout)

  const differences = arrayDifferences(commandsExecutedInTestMode, commandsExecutedInProdMode)

  assertEquals(differences, [
    `git push '--dry-run'`,
    `git push`,
  ])

  assertArrayIncludes(commandsExecutedInTestMode, [`git push '--dry-run'`], "Test mode should include --dry-run")
})

Deno.test("compiles binaries and passes correct paths to set-github-release-assets", async () => {
  await mockBin(
    "git",
    "#!/usr/bin/env -S deno run --quiet --allow-all",
    `
const args = Deno.args;
const command = args[0];
`,
  )

  const version = "2.5.0"

  const { code, stdout } = await runScript<DeployStepInput, void>("deno run --allow-all steps/deploy.ts", getScriptInput(version))
  assertEquals(code, 0, "Deploy should succeed")

  // Define expected binary paths (from deploy.ts)
  const expectedBinaries = [
    "dist/bin-x86_64-Linux",
    "dist/bin-aarch64-Linux",
    "dist/bin-x86_64-Darwin",
    "dist/bin-aarch64-Darwin",
  ]

  for (const expectedBinary of expectedBinaries) {
    // Verify each binary was created
    const fileInfo = await Deno.stat(expectedBinary)
    assertEquals(fileInfo.isFile, true, `${expectedBinary} should be a file`)
  }

  const commandsExecuted = getCommandsExecuted(stdout)
  const setGithubReleaseAssetsCommand = commandsExecuted.filter((cmd) => cmd.includes("set-github-release-assets"))[0]

  // Verify that set-github-release-assets command includes all expected binaries
  for (const expectedBinary of expectedBinaries) {
    assertStringIncludes(
      setGithubReleaseAssetsCommand,
      `${expectedBinary}#${expectedBinary.replace("dist/", "")}`,
      `set-github-release-assets should include ${expectedBinary}#${expectedBinary.replace("dist/", "")}`,
    )
  }
})

Deno.test("final command should be updating single-source-version (github releases)", async () => {
  await mockBin(
    "git",
    "#!/usr/bin/env -S deno run --quiet --allow-all",
    `
const args = Deno.args;
const command = args[0];
`,
  )

  const version = "3.0.0"
  const input = getScriptInput(version)

  const { code, stdout } = await runScript<DeployStepInput, void>("deno run --allow-all steps/deploy.ts", input)
  assertEquals(code, 0, "Deploy should succeed")

  const commandsExecuted = getCommandsExecuted(stdout)
  const lastCommand = commandsExecuted[commandsExecuted.length - 1]

  // Verify the last command is the GitHub release 'set' command
  assertStringIncludes(
    lastCommand,
    `'jsr:@levibostian/decaf-script-github-releases' set`,
    "Last command should be GitHub release 'set' command",
  )
})

Deno.test("assert logs from script are human readable and explain the deployment process", async (t) => {
  await mockBin(
    "git",
    "#!/usr/bin/env -S deno run --quiet --allow-all",
    `
const args = Deno.args;
const command = args[0];
`,
  )

  const version = "3.0.0"
  const input = getScriptInput(version)

  const { code, stdout } = await runScript<DeployStepInput, void>("deno run --allow-all steps/deploy.ts", input)
  assertEquals(code, 0, "Deploy should succeed")

  await assertSnapshot(t, stdout.join("\n"))
})
