import { join } from "@std/path"
import { Exec } from "./exec.ts"
import { Logger } from "./log.ts"

type ParsedShebangCommand = {
  cloneUrl: string
  relativeFile: string
  ref: string
  args: string
}

/**
 * Format: <git-clone-url>/<relative-file>@<ref> [args...]
 *
 * Example: git@github.com/levibostian/decaf-script-major-tag.git/run.ts@0.13.0 --commit-sha abc123
 */
const SHEBANG_REGEX = /^(.*\.git)\/([^\s@]+)@([^\s]+)(.*)/

const parseShebangCommand = (command: string): ParsedShebangCommand | undefined => {
  const trimmed = command.trim()
  const match = SHEBANG_REGEX.exec(trimmed)
  if (!match) return undefined

  const [, cloneUrl, relativeFile, ref, rawArgs] = match
  return {
    cloneUrl,
    relativeFile,
    ref,
    args: rawArgs.trim(),
  }
}

export async function runShebangCommand(
  { command, exec, logger }: { command: string; exec: Exec; logger: Logger },
): Promise<void> {
  if (!command.trim()) {
    logger.error([
      "Missing shebang target. Usage: decaf shebang <git-url>/<file>@<ref> [args...]",
    ])
    throw new Error("Missing shebang target")
  }

  const parsed = parseShebangCommand(command)
  if (!parsed) {
    logger.error([
      "Invalid shebang target. Expected <git-url>/<file>@<ref> [args...]",
    ])
    throw new Error("Invalid shebang target")
  }

  const tempDir = await Deno.makeTempDir({ prefix: "decaf-shebang-" })

  try { // only exists for the finally cleanup block.
    await exec.run({
      command: `git init ${tempDir}`,
      input: undefined,
      displayLogs: false,
      throwOnNonZeroExitCode: true,
    })
    await exec.run({
      command: `git -C ${tempDir} remote add origin ${parsed.cloneUrl}`,
      input: undefined,
      displayLogs: false,
      throwOnNonZeroExitCode: true,
    })
    await exec.run({
      command: `git -C ${tempDir} fetch --depth 1 origin ${parsed.ref}`,
      input: undefined,
      displayLogs: false,
      throwOnNonZeroExitCode: true,
    })
    await exec.run({
      command: `git -C ${tempDir} checkout FETCH_HEAD`,
      input: undefined,
      displayLogs: false,
      throwOnNonZeroExitCode: true,
    })

    const absoluteFilePath = join(tempDir, parsed.relativeFile)

    // before chmod runs, make sure that the file even exists.
    try {
      await Deno.stat(absoluteFilePath)
    } catch {
      logger.error([`File ${parsed.relativeFile} not found in repository ${parsed.cloneUrl}@${parsed.ref}`])
      throw new Error("Shebang target file not found")
    }

    await exec.run({
      command: `chmod +x ${absoluteFilePath}`,
      input: undefined,
      displayLogs: false,
      throwOnNonZeroExitCode: true,
    })

    const commandToRun = parsed.args ? `${absoluteFilePath} ${parsed.args}` : absoluteFilePath

    await exec.run({
      command: commandToRun,
      input: undefined,
      displayLogs: true, // so user sees the output of their script
      currentWorkingDirectory: Deno.cwd(),
      throwOnNonZeroExitCode: true,
    })
  } catch (error) {
    throw error // re-throw to be caught by caller. we just need finally to run for cleanup.
  } finally {
    try {
      await Deno.remove(tempDir, { recursive: true })
    } catch (cleanupError) {
      logger.debug(`Failed to remove temp dir ${tempDir}: ${cleanupError}`)
    }
  }
}
