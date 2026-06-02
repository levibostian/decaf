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

    let envVars = Deno.env.toObject()
    logger.debug(`Running shebang command with env vars: ${JSON.stringify(envVars)}`)

    const miseCheck = await exec.run({
      command: "command -v mise",
      input: undefined,
      displayLogs: false,
      throwOnNonZeroExitCode: false,
    })

    if (miseCheck.exitCode !== 0) {
      logger.debug("Mise not found in PATH, installing it for shebang command...")

      const installMiseResult = await exec.run({
        command: "curl https://mise.run | MISE_INSTALL_PATH=~/.local/bin/mise sh",
        input: undefined,
        displayLogs: false,
        throwOnNonZeroExitCode: true,
      })

      if (installMiseResult.exitCode === 0) {
        logger.debug("Mise installed successfully, adding it to PATH for shebang command...")

        const misePath = "~/.local/bin/mise"
        const currentPath = Deno.env.get("PATH") || ""
        const updatedPath = currentPath ? `${currentPath}:${misePath}` : misePath

        envVars = {
          ...envVars,
          PATH: updatedPath,
        }
      }
    }

    const result = await exec.run({
      command: commandToRun,
      input: undefined,
      displayLogs: true, // so user sees the output of their script
      envVars,
      currentWorkingDirectory: tempDir,
      throwOnNonZeroExitCode: false,
    })

    // if the shebang command failed, just exit.
    // dont throw because user seeing decaf stacktrace doesn't make sense.
    // also no need for logging because we already display all logs from the command.
    if (result.exitCode !== 0) {
      Deno.exit(result.exitCode)
    }
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
