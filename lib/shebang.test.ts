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

type CapturedRun = {
  command: string
  envVars?: { [key: string]: string }
}

const runAndCaptureCommands = async (
  command: string,
  runResultForCommand?: (command: string) => RunResult,
): Promise<CapturedRun[]> => {
  const execMock = mock<Exec>()
  const runs: CapturedRun[] = []

  when(execMock, "run", async ({ command: execCommand, envVars }) => {
    runs.push({ command: execCommand, envVars })
    return runResultForCommand?.(execCommand) ?? successRunResult
  })

  const logger = mock<Logger>()

  await runShebangCommand({
    command,
    exec: execMock,
    logger,
  })

  return runs
}

Deno.test("runShebangCommand - clones and runs resolved command", async () => {
  const tempDir = "/tmp/decaf-shebang-test"

  stub(Deno, "makeTempDir", async () => tempDir)
  stub(Deno, "remove", async () => {})
  stub(Deno, "stat", async () => ({} as Deno.FileInfo))
  stub(Deno, "readTextFile", async () => "fd1f6c959200073e4f532cc82cc1cdaa65b45e21\t\tbranch 'main' of github.com:levibostian/decaf")

  const runs = await runAndCaptureCommands(
    "git@github.com/owner/repo.git/run.ts@v1.0.0 --flag value",
  )

  assertEquals(runs.length, 7)
  assertEquals(runs[0].command, `git init ${tempDir}`)
  assertEquals(runs[1].command, `git -C ${tempDir} remote add origin git@github.com/owner/repo.git`)
  assertEquals(runs[2].command, `git -C ${tempDir} fetch --depth 1 origin v1.0.0`)
  assertEquals(runs[3].command, `git -C ${tempDir} checkout FETCH_HEAD`)
  assertEquals(runs[4].command, `chmod +x ${tempDir}/run.ts`)
  assertEquals(runs[5].command, "command -v mise")
  assertEquals(runs[6].command, `${tempDir}/run.ts --flag value`)
})

Deno.test("runShebangCommand - parses clone URLs and refs", async () => {
  const tempDir = "/tmp/decaf-shebang-parse"

  stub(Deno, "makeTempDir", async () => tempDir)
  stub(Deno, "remove", async () => {})
  stub(Deno, "stat", async () => ({} as Deno.FileInfo))
  stub(Deno, "readTextFile", async () => "fd1f6c959200073e4f532cc82cc1cdaa65b45e21\t\tbranch 'main' of github.com:levibostian/decaf")

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
    const runs = await runAndCaptureCommands(
      scenario.command,
    )

    assertEquals(runs[1].command, `git -C ${tempDir} remote add origin ${scenario.cloneUrl}`)
    assertEquals(runs[2].command, `git -C ${tempDir} fetch --depth 1 origin ${scenario.ref}`)
    assertEquals(runs[4].command, `chmod +x ${tempDir}/run.ts`)
    assertEquals(runs[6].command, scenario.expectedRun)
  }
})

Deno.test("runShebangCommand - installs mise and appends PATH when missing", async () => {
  const tempDir = "/tmp/decaf-shebang-mise-install"

  stub(Deno, "makeTempDir", async () => tempDir)
  stub(Deno, "remove", async () => {})
  stub(Deno, "stat", async () => ({} as Deno.FileInfo))
  stub(Deno, "readTextFile", async () => "fd1f6c959200073e4f532cc82cc1cdaa65b45e21\t\tbranch 'main' of github.com:levibostian/decaf")
  stub(Deno.env, "get", (key: string) => {
    if (key === "PATH") return "/usr/bin"
    return undefined
  })

  const runs = await runAndCaptureCommands(
    "https://github.com/owner/repo.git/run.ts@main",
    (execCommand) => {
      if (execCommand === "command -v mise") {
        return { ...successRunResult, exitCode: 1 }
      }
      return successRunResult
    },
  )

  assertEquals(runs.length, 8)
  assertEquals(runs[5].command, "command -v mise")
  assertEquals(runs[6].command, "curl https://mise.run | MISE_INSTALL_PATH=~/.local/bin/mise sh")
  assertEquals(runs[7].envVars!["PATH"], "/usr/bin:~/.local/bin/mise")
})
