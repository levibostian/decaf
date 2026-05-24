import { join } from "@std/path"
import { Exec } from "./exec.ts"
import { Logger } from "./log.ts"

type ParsedShebangCommand = {
  cloneUrl: string
  relativeFile: string
  ref: string
  args: string
}

type ParsedFetchHead = {
  refType: "tag" | "branch" | "commit"
  refName: string
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

const parseFetchHead = (contents: string): ParsedFetchHead | undefined => {
  const firstLine = contents.split("\n").find((line) => line.trim())
  if (!firstLine) return undefined

  const [sha, ...rest] = firstLine.split("\t")
  if (!sha?.trim()) return undefined

  const description = rest.join("\t").trim()

  const tagMatch = /tag '([^']+)'/.exec(description)
  if (tagMatch) {
    return { refType: "tag", refName: tagMatch[1] }
  }

  const branchMatch = /branch '([^']+)'/.exec(description)
  if (branchMatch) {
    return { refType: "branch", refName: branchMatch[1] }
  }

  const refTagMatch = /ref 'refs\/tags\/([^']+)'/.exec(description)
  if (refTagMatch) {
    return { refType: "tag", refName: refTagMatch[1] }
  }

  const refBranchMatch = /ref 'refs\/heads\/([^']+)'/.exec(description)
  if (refBranchMatch) {
    return { refType: "branch", refName: refBranchMatch[1] }
  }

  return { refType: "commit", refName: sha.trim() }
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

    const commandToRun = parsed.args ? `${absoluteFilePath} ${parsed.args}` : absoluteFilePath

    const fetchHeadContents = await Deno.readTextFile(join(tempDir, ".git", "FETCH_HEAD"))
    const fetchHead = parseFetchHead(fetchHeadContents)
    const envVars = fetchHead
      ? {
        DECAF_SHEBANG_REF: fetchHead.refType,
        DECAF_SHEBANG_REF_NAME: fetchHead.refName,
      }
      : undefined

    await exec.run({
      command: `chmod +x ${absoluteFilePath}`,
      input: undefined,
      displayLogs: false,
      throwOnNonZeroExitCode: true,
    })

    await exec.run({
      command: commandToRun,
      input: undefined,
      displayLogs: true, // so user sees the output of their script
      currentWorkingDirectory: Deno.cwd(),
      envVars,
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
