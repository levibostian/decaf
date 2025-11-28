import colors from "ansi-styles"
import envCi from "env-ci"

// log.ts
// This module provides a simple API for logging messages at different levels to GitHub Actions.

// GitHub Actions supports setting log level by prefixing the message with specific tokens.
// Reference: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-a-debug-message

// All of the different log levels that can be used in this project.
interface LogLevels {
  debug: string
  warning: string
  error: string
  notice: string
  message: string
}

// Log levels for GitHub Actions. Each level has a specific prefix that GitHub Actions recognizes and formats accordingly.
const githubActionLevels: LogLevels = {
  debug: `::debug::${colors.white.open}`, // Debug messages, not shown by default in GitHub Actions logs.
  warning: `::warning::${colors.white.open}`, // Lines are highlighted with yellow in the GitHub Actions logs.
  error: `::error::${colors.white.open}`, // Lines are highlighted with red in the GitHub Actions logs.
  notice: `${colors.blue.open}`, // Notice messages, a way to highlight important information, displayed in blue.
  message: `${colors.white.open}`,
}

// Log levels for non-GitHub Actions CI environments. GitHub Actions has specific formatting for log levels, but other CI environments may not support the same syntax.
const otherCILevels: LogLevels = {
  debug: `${colors.white.open}`, // Debug messages, not shown by default in other CI logs.
  warning: `${colors.yellow.open}`, // Lines are highlighted with yellow in the logs.
  error: `${colors.red.open}`, // Lines are highlighted with red in the logs.
  notice: `${colors.blue.open}`, // Notice messages, displayed in blue.
  message: `${colors.white.open}`,
}

export interface Logger {
  debug: (message: string) => void
  warning: (message: string) => void
  error: (message: string) => void
  notice: (message: string) => void
  message: (message: string) => void
}

// The way we log is different depending on whether we are running on GitHub Actions or another CI service.
// We use the env-ci package to detect the CI environment. I dont want the logger to use the DI graph to make
// using it more complex, so just using env-ci directly here.
const isOnGitHubActions = envCi().isCi && envCi().service === "github"

// Generic log function that is used by all other logging functions.
function log(level: keyof LogLevels, message: string) {
  const isDebugMessage = level === "debug"

  // Show if:
  // - The message is not a debug message
  // - user enabled debug logs via CLI argument
  // - we are running in github actions. since github actions will hide debug messages unless you enable debug mode in the web UI.
  const shouldPrintMessageToConsole = !isDebugMessage || Deno.env.get("INPUT_DEBUG") === "true" || isOnGitHubActions

  if (shouldPrintMessageToConsole) {
    // github actions works better to print line by line otherwise some debug logs may show up in non-debug mode.
    message.split("\n").forEach((line) => {
      const consoleLogLine = isOnGitHubActions ? `${githubActionLevels[level]}${line}` : `${otherCILevels[level]}${line}`
      console.log(consoleLogLine)
    })
  }
}

/**
 * Logs a debug message, which is not shown by default but can be enabled in the GitHub Actions workflow settings.
 * Debug messages are useful for detailed troubleshooting information.
 */
export function debug(message: string) {
  log("debug", message)
}

/**
 * Logs a warning message, displayed in yellow in the GitHub Actions logs.
 * Warning messages are useful for non-critical issues that should be highlighted to users.
 */
export function warning(message: string) {
  log("warning", message)
}

/**
 * Logs an error message, displayed in red in the GitHub Actions logs.
 * Error messages are critical and indicate something went wrong during the execution of the workflow.
 */
export function error(message: string) {
  log("error", message)
}

/**
 * Logs a notice message, displayed in blue in the GitHub Actions logs.
 * Notice messages are useful for highlighting important information that is not necessarily an error or warning.
 */
export function notice(message: string) {
  log("notice", message)
}

/**
 * Logs a standard message without any specific log level prefix.
 * These messages are displayed in the standard log color and are useful for general information.
 */
export function message(message: string) {
  log("message", message)
}

export const logger: Logger = {
  debug,
  warning,
  error,
  notice,
  message,
}
