import colors from "npm:ansi-styles@6.2.1";

// log.ts
// This module provides a simple API for logging messages at different levels to GitHub Actions.

// GitHub Actions supports setting log level by prefixing the message with specific tokens.
// Reference: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-a-debug-message

// Log levels
const levels = {
  debug: `::debug::${colors.white.open}`, // Debug messages, not shown by default in GitHub Actions logs.
  warning: `::warning::${colors.white.open}`, // Lines are highlighted with yellow in the GitHub Actions logs.
  error: `::error::${colors.white.open}`, // Lines are highlighted with red in the GitHub Actions logs.
  notice: `${colors.blue.open}`, // Notice messages, a way to highlight important information, displayed in blue.
  message: `${colors.white.open}`,
};

export interface Logger {
  debug: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
  notice: (message: string) => void;
  message: (message: string) => void;
}

// Generic log function
function log(level: keyof typeof levels, message: string) {
  message.split("\n").forEach((line) => {
    console.log(`${levels[level]}${line}`);
  })
}

/**
 * Logs a debug message, which is not shown by default but can be enabled in the GitHub Actions workflow settings.
 * Debug messages are useful for detailed troubleshooting information.
 */
export function debug(message: string) {
  log("debug", message);
}

/**
 * Logs a warning message, displayed in yellow in the GitHub Actions logs.
 * Warning messages are useful for non-critical issues that should be highlighted to users.
 */
export function warning(message: string) {
  log("warning", message);
}

/**
 * Logs an error message, displayed in red in the GitHub Actions logs.
 * Error messages are critical and indicate something went wrong during the execution of the workflow.
 */
export function error(message: string) {
  log("error", message);
}

/**
 * Logs a notice message, displayed in blue in the GitHub Actions logs.
 * Notice messages are useful for highlighting important information that is not necessarily an error or warning.
 */
export function notice(message: string) {
  log("notice", message);
}

/**
 * Logs a standard message without any specific log level prefix.
 * These messages are displayed in the standard log color and are useful for general information.
 */
export function message(message: string) {
  log("message", message);
}

export const logger: Logger = {
  debug,
  warning,
  error,
  notice,
  message,
};

