import { assertEquals, assertRejects } from "@std/assert"
import { restore, stub } from "@std/testing/mock"
import { Exec, RunResult } from "./exec.ts"
import { Logger } from "./log.ts"
import { mock, when } from "./mock/mock.ts"
import { runShebangCommand } from "./shebang.ts"

const successRunResult: RunResult = {
  exitCode: 0,
  stdout: "",
  stderr: "",
  output: undefined,
}

Deno.test.beforeEach(() => {
  restore()
})

Deno.test("runShebangCommand - throws when target missing", async () => {
  const execMock = mock<Exec>()
  const logger = mock<Logger>()

  await assertRejects(
    () => runShebangCommand({ command: "", exec: execMock, logger }),
    Error,
    "Missing shebang target",
  )
})

Deno.test("runShebangCommand - throws on invalid target", async () => {
  const execMock = mock<Exec>()
  const logger = mock<Logger>()

  await assertRejects(
    () =>
      runShebangCommand({
        command: "not-a-shebang",
        exec: execMock,
        logger,
      }),
    Error,
    "Invalid shebang target",
  )
})

const runAndCaptureCommands = async (command: string): Promise<string[]> => {
  const execMock = mock<Exec>()
  const commands: string[] = []

  when(execMock, "run", async ({ command: execCommand }) => {
    commands.push(execCommand)
    return successRunResult
  })

  const logger = mock<Logger>()

  await runShebangCommand({
    command,
    exec: execMock,
    logger,
  })

  return commands
}

Deno.test("runShebangCommand - clones and runs resolved command", async () => {
  const tempDir = "/tmp/decaf-shebang-test"

  stub(Deno, "makeTempDir", async () => tempDir)
  stub(Deno, "remove", async () => {})
  stub(Deno, "stat", async () => ({} as Deno.FileInfo))

  const commands = await runAndCaptureCommands(
    "git@github.com/owner/repo.git/run.ts@v1.0.0 --flag value",
  )

  assertEquals(commands.length, 6)
  assertEquals(commands[0], `git init ${tempDir}`)
  assertEquals(commands[1], `git -C ${tempDir} remote add origin git@github.com/owner/repo.git`)
  assertEquals(commands[2], `git -C ${tempDir} fetch --depth 1 origin v1.0.0`)
  assertEquals(commands[3], `git -C ${tempDir} checkout FETCH_HEAD`)
  assertEquals(commands[4], `chmod +x ${tempDir}/run.ts`)
  assertEquals(commands[5], `${tempDir}/run.ts --flag value`)
})

Deno.test("runShebangCommand - parses clone URLs and refs", async () => {
  const tempDir = "/tmp/decaf-shebang-parse"

  stub(Deno, "makeTempDir", async () => tempDir)
  stub(Deno, "remove", async () => {})
  stub(Deno, "stat", async () => ({} as Deno.FileInfo))

  const scenarios = [
    {
      command: "https://github.com/owner/repo.git/run.ts@v1.0.0",
      cloneUrl: "https://github.com/owner/repo.git",
      ref: "v1.0.0",
      expectedRun: `${tempDir}/run.ts`,
    },
    {
      command: "git@github.com:owner/repo.git/run.ts@main",
      cloneUrl: "git@github.com:owner/repo.git",
      ref: "main",
      expectedRun: `${tempDir}/run.ts`,
    },
    {
      command: "git@github.com/owner/repo.git/run.ts@feature/test",
      cloneUrl: "git@github.com/owner/repo.git",
      ref: "feature/test",
      expectedRun: `${tempDir}/run.ts`,
    },
    {
      command: "https://gitlab.com/owner/repo.git/run.ts@abc1234def --arg one",
      cloneUrl: "https://gitlab.com/owner/repo.git",
      ref: "abc1234def",
      expectedRun: `${tempDir}/run.ts --arg one`,
    },
  ]

  for (const scenario of scenarios) {
    const commands = await runAndCaptureCommands(
      scenario.command,
    )

    assertEquals(commands[1], `git -C ${tempDir} remote add origin ${scenario.cloneUrl}`)
    assertEquals(commands[2], `git -C ${tempDir} fetch --depth 1 origin ${scenario.ref}`)
    assertEquals(commands[4], `chmod +x ${tempDir}/run.ts`)
    assertEquals(commands[5], scenario.expectedRun)
  }
})
