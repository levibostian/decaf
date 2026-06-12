import { assertEquals } from "@std/assert"
import process from "node:process"
import { Logger } from "./log.ts"

function restoreEnvVar(name: string, value: string | undefined) {
  if (value === undefined) {
    Deno.env.delete(name)
    return
  }

  Deno.env.set(name, value)
}

Deno.test("debug prefixes blank lines on GitHub Actions", () => {
  const originalInputDebug = Deno.env.get("INPUT_DEBUG")
  const originalCi = Deno.env.get("CI")
  const originalGitHubActions = Deno.env.get("GITHUB_ACTIONS")

  Deno.env.set("INPUT_DEBUG", "true")
  Deno.env.set("CI", "true")
  Deno.env.set("GITHUB_ACTIONS", "true")

  const originalStdoutWrite = process.stdout.write
  let capturedOutput = ""

  // deno-lint-ignore no-explicit-any
  process.stdout.write = ((chunk: any) => {
    capturedOutput += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
    return true
  }) as typeof process.stdout.write

  try {
    const logger = new Logger()
    logger.init()

    logger.debug("line 1\n\nline 3")
  } finally {
    process.stdout.write = originalStdoutWrite

    restoreEnvVar("INPUT_DEBUG", originalInputDebug)
    restoreEnvVar("CI", originalCi)
    restoreEnvVar("GITHUB_ACTIONS", originalGitHubActions)
  }

  assertEquals(capturedOutput, "::debug::line 1\n::debug::\u200B\n::debug::line 3\n")
})
