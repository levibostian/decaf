import { join } from "@std/path"
import { Exec, RunResult } from "./exec.ts"
import { Logger } from "./log.ts"

type ParsedShebangCommand = {
  cloneUrl: string
  relativeFile: string
  ref: string
  args: string
}

type ExecutedCommandLog = {
  command: string
  result: RunResult
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

  // Running setup commands to prepare to run the user provided script.
  const setupCommandLogs: ExecutedCommandLog[] = []

  const runSetupCommand = async (setupCommand: string): Promise<RunResult> => {
    // An existing decaf process is what will execute a decaf shebang command.
    // So, treat shebang command like it's own standalone CLI regarding stdout/stderr logging because the existing decaf process is much more opinionated about how logs are put in the console.
    // The design is:
    // - for setup commands, do zero logging unless there is an error which we will then dump all setup logs for debugging.
    // - For the user provided script, show the logs as if the script ran outside of decaf.
    const result = await exec.run({
      command: setupCommand,
      input: undefined,
      displayLogs: false,
      suppressCommandLogs: true,
      suppressOutputLogs: true,
      throwOnNonZeroExitCode: false,
    })

    setupCommandLogs.push({ command: setupCommand, result })

    if (result.exitCode !== 0) {
      throw new Error(`Setup command failed: ${setupCommand}`)
    }

    return result
  }

  // setup commands.
  try {
    await runSetupCommand(`git init ${tempDir}`)
    await runSetupCommand(`git -C ${tempDir} remote add origin ${parsed.cloneUrl}`)
    await runSetupCommand(`git -C ${tempDir} fetch --depth 1 origin ${parsed.ref}`)
    await runSetupCommand(`git -C ${tempDir} checkout FETCH_HEAD`)

    const absoluteFilePathToUserScript = join(tempDir, parsed.relativeFile)

    try {
      await Deno.stat(absoluteFilePathToUserScript)
    } catch {
      throw new Error(`File ${parsed.relativeFile} not found in repository ${parsed.cloneUrl}@${parsed.ref}`)
    }

    await runSetupCommand(`chmod +x ${absoluteFilePathToUserScript}`)
  } catch (setupError) {
    const errorLogLines = [
      "Shebang command setup failed.",
      `${setupError}`,
    ]

    for (const { command, result } of setupCommandLogs) {
      errorLogLines.push(`command: ${command}`)
      errorLogLines.push(`exit code: ${result.exitCode}`)
      errorLogLines.push(`stdout: ${result.stdout || "(empty)"}`)
      errorLogLines.push(`stderr: ${result.stderr || "(empty)"}`)
      errorLogLines.push("---")
    }

    logger.error(errorLogLines)

    Deno.exit(1) // don't attempt to run the user provided script if setup failed, but do exit with code 1 instead of throwing to avoid dumping a stack trace which would be confusing since the error is already logged.
  }

  const absoluteFilePathToUserScript = join(tempDir, parsed.relativeFile)
  const commandToRun = parsed.args ? `${absoluteFilePathToUserScript} ${parsed.args}` : absoluteFilePathToUserScript

  let envVars = Deno.env.toObject()

  const miseCheck = await exec.run({
    command: "command -v mise",
    input: undefined,
    displayLogs: false,
    suppressCommandLogs: true,
    throwOnNonZeroExitCode: false,
  })

  if (miseCheck.exitCode !== 0) {
    const installMiseResult = await exec.run({
      command: "curl https://mise.run | MISE_INSTALL_PATH=~/.local/bin/mise sh",
      input: undefined,
      displayLogs: false,
      suppressCommandLogs: true,
      throwOnNonZeroExitCode: false,
    })

    if (installMiseResult.exitCode === 0) {
      const misePath = "~/.local/bin/mise"
      const currentPath = Deno.env.get("PATH") || ""
      const updatedPath = currentPath ? `${currentPath}:${misePath}` : misePath

      envVars = {
        ...envVars,
        PATH: updatedPath,
      }
    }
  }

  const shebangResult = await exec.run({
    command: commandToRun,
    input: undefined,
    displayLogs: true,
    suppressCommandLogs: true, // the script is located in /tmp/ with a random string name so this would just look odd.
    envVars,
    currentWorkingDirectory: tempDir,
    throwOnNonZeroExitCode: false,
  })

  if (shebangResult.exitCode !== 0) {
    logger.error([
      "Shebang command failed.",
      `exit code: ${shebangResult.exitCode}`,
      `stdout: ${shebangResult.stdout || "(empty)"}`,
      `stderr: ${shebangResult.stderr || "(empty)"}`,
    ])
    Deno.exit(shebangResult.exitCode)
  }
}
