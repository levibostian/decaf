import * as log from "./log.ts"

export interface GitHubRemoteScript {
  owner: string
  repo: string
  path: string
  ref: string
  args: string[]
}

/**
 * Checks if a command string starts with a GitHub URL pattern
 * Format: github.com/owner/repo/path@ref [args...]
 */
export function isGitHubRemoteScript(command: string): boolean {
  const trimmed = command.trim()
  return trimmed.startsWith("github.com/")
}

/**
 * Parses a GitHub URL command into its components
 * Format: github.com/owner/repo/path@ref [args...]
 * Example: github.com/foo/bar/scripts/deploy.ts@main arg1 arg2
 *
 * @throws {Error} if the format is invalid
 */
export function parseGitHubRemoteScript(command: string): GitHubRemoteScript {
  const trimmed = command.trim()

  if (!trimmed.startsWith("github.com/")) {
    throw new Error("GitHub URL must start with github.com/")
  }

  // Remove "github.com/" prefix
  const withoutPrefix = trimmed.slice("github.com/".length)

  // Split by whitespace to separate the URL from arguments
  const parts = withoutPrefix.split(/\s+/)
  const urlPart = parts[0]
  const args = parts.slice(1)

  // Split by @ to get the path and ref
  const atIndex = urlPart.indexOf("@")
  if (atIndex === -1) {
    throw new Error("GitHub URL must include @ref (e.g., @main, @v1.0.0, @commit-hash)")
  }

  const pathPart = urlPart.slice(0, atIndex)
  const ref = urlPart.slice(atIndex + 1)

  if (!ref) {
    throw new Error("Git reference cannot be empty after @")
  }

  // Split path into owner/repo/file-path
  const pathSegments = pathPart.split("/")
  if (pathSegments.length < 3) {
    throw new Error("GitHub URL must include owner, repo, and file path (e.g., github.com/owner/repo/path/to/script.ts@ref)")
  }

  const owner = pathSegments[0]
  const repo = pathSegments[1]
  const path = pathSegments.slice(2).join("/")

  if (!owner || !repo || !path) {
    throw new Error("Owner, repo, and path must all be non-empty")
  }

  return {
    owner,
    repo,
    path,
    ref,
    args,
  }
}

/**
 * Downloads a file from GitHub and returns the path to the temporary file
 * Uses the GitHub raw content URL
 */
export async function downloadGitHubScript(script: GitHubRemoteScript): Promise<string> {
  const rawUrl = `https://raw.githubusercontent.com/${script.owner}/${script.repo}/${script.ref}/${script.path}`

  log.debug(`Downloading script from: ${rawUrl}`)

  const response = await fetch(rawUrl)

  if (!response.ok) {
    // Consume the response body to prevent resource leak
    await response.text()
    throw new Error(`Failed to download script from ${rawUrl}: ${response.status} ${response.statusText}`)
  }

  const content = await response.text()

  // Create a temporary file with the script content
  const tempFile = await Deno.makeTempFile({
    prefix: "decaf-github-",
    suffix: `.${script.path.split("/").pop() || "sh"}`,
  })

  await Deno.writeTextFile(tempFile, content)

  // Make the file executable (required for shebang to work)
  await Deno.chmod(tempFile, 0o755)

  log.debug(`Script downloaded to: ${tempFile}`)

  return tempFile
}

/**
 * Converts a GitHub URL command into a shell command that executes the downloaded script
 *
 * @param command Original command string (e.g., "github.com/owner/repo/script.ts@main arg1 arg2")
 * @returns A shell command that executes the downloaded script with its arguments
 */
export async function convertGitHubUrlToCommand(command: string): Promise<string> {
  const script = parseGitHubRemoteScript(command)
  const tempFile = await downloadGitHubScript(script)

  // Build the command to execute the script with its arguments
  const argsString = script.args.length > 0 ? " " + script.args.join(" ") : ""
  const execCommand = `${tempFile}${argsString}`

  return execCommand
}
