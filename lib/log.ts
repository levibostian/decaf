import envCi from "env-ci"
import createLogger, { LoggerInstance as ShStyleLogger } from "@levibostian/sh-style"
import { Writable } from "node:stream"
import process from "node:process"

/**
 * 1 class for all logging. Created just so I had 1 data type I could use in the whole codebase for all logging.
 *
 * Do not forget to call `await logger.init()` after creating an instance of this class.
 */
export class Logger implements ShStyleLogger, Pick<Console, "debug">, Pick<Console, "log"> {
  private readonly isOnGitHubActions: boolean
  private shStyle: ShStyleLogger = {} as ShStyleLogger
  private out: Writable
  private err: Writable

  lines: string[] = []

  constructor(out: Writable = process.stdout, err: Writable = process.stderr) {
    this.out = out
    this.err = err

    this.isOnGitHubActions = envCi().isCi && envCi().service === "github"
  }

  // One-time requirement to call. Required by sh-style to download its binary if needed.
  async init() {
    // setting the logger which will....
    // 1. pass the function call to sh-style library to render the log message in a nice format in the terminal.
    // 2. sh-style passes it back to us so we can capture the log messages in our `lines` property for testing purposes.
    this.shStyle = await createLogger({
      logger: this,
    })
  }

  // special function that bypasses sh-style and simply prints to console. Limit the use of it!
  raw(text: string): void {
    this.lines.push(text)
    console.log(text)
  }

  // sh-style logger methods
  msg(text: string): void {
    this.shStyle.msg(text)
  }
  title(text: string): void {
    this.shStyle.title(text)
  }
  phase(text: string): void {
    this.shStyle.phase(text)
  }
  step(text: string): void {
    this.shStyle.step(text)
  }
  note(text: string): void {
    this.shStyle.note(text)
  }
  why(text: string): void {
    this.shStyle.why(text)
  }
  plan(text: string): void {
    this.shStyle.plan(text)
  }
  ok(text: string): void {
    this.shStyle.ok(text)
  }
  done(text: string): void {
    this.shStyle.done(text)
  }
  cmd(text: string): void {
    this.shStyle.cmd(text)
  }
  warn(text: string, details?: string[]): void {
    this.shStyle.warn(text, details)
  }
  error(lines: string[]): void {
    this.shStyle.error(lines)
  }
  kv(label: string, entries: [string, string][]): void {
    this.shStyle.kv(label, entries)
  }
  list(label: string, items: string[]): void {
    this.shStyle.list(label, items)
  }

  // Console methods
  // deno-lint-ignore no-explicit-any
  debug(...data: any[]): void {
    // Show if:
    // - user enabled debug logs via CLI argument
    // - we are running in github actions. since github actions will hide debug messages unless you enable debug mode in the web UI.
    const shouldPrintMessageToConsole = Deno.env.get("INPUT_DEBUG") === "true" || this.isOnGitHubActions

    if (shouldPrintMessageToConsole) {
      // github actions works better to print line by line otherwise some debug logs may show up in non-debug mode.
      data.forEach((line) => {
        console.log(this.isOnGitHubActions ? `::debug::${line}` : line)
      })
    }
  }
  // deno-lint-ignore no-explicit-any
  log(...data: any[]): void {
    this.lines.push(...data.map(String))
    console.log(...data)
  }
}
