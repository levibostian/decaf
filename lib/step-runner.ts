import { jsonParse, renderStringTemplate } from "./utils.ts"
import { Environment } from "./environment.ts"
import { Exec } from "./exec.ts"
import { AnyStepInput, DeployStepInput, GetLatestReleaseStepInput, GetNextReleaseVersionStepInput } from "./types/environment.ts"
import { AnyStepName } from "./steps/types/any-step.ts"
import {
  GetLatestReleaseStepOutput,
  GetNextReleaseVersionStepOutput,
  isGetLatestReleaseStepOutput,
  isGetNextReleaseVersionStepOutput,
} from "./steps/types/output.ts"
import { Logger } from "./log.ts"

export interface StepRunner {
  runGetLatestOnCurrentBranchReleaseStep: (input: GetLatestReleaseStepInput) => Promise<GetLatestReleaseStepOutput | null>
  determineNextReleaseVersionStep: (input: GetNextReleaseVersionStepInput) => Promise<GetNextReleaseVersionStepOutput | null>
  runDeployStep: (input: DeployStepInput) => Promise<void>
}

export class StepRunnerImpl implements StepRunner {
  private environment: Environment
  private exec: Exec
  private logger: Logger
  private gitRootDirectory: string
  private userScriptCurrentWorkingDirectory: string

  constructor(options: {
    environment: Environment
    exec: Exec
    logger: Logger
    gitRootDirectory: string
    userScriptCurrentWorkingDirectory: string
  }) {
    this.environment = options.environment
    this.exec = options.exec
    this.logger = options.logger
    this.gitRootDirectory = options.gitRootDirectory
    this.userScriptCurrentWorkingDirectory = options.userScriptCurrentWorkingDirectory
  }

  runGetLatestOnCurrentBranchReleaseStep(input: GetLatestReleaseStepInput): Promise<GetLatestReleaseStepOutput | null> {
    return this.getCommandFromUserAndRun({ step: "get_latest_release_current_branch", input, outputCheck: isGetLatestReleaseStepOutput })
  }

  determineNextReleaseVersionStep(input: GetNextReleaseVersionStepInput): Promise<GetNextReleaseVersionStepOutput | null> {
    return this.getCommandFromUserAndRun({ step: "get_next_release_version", input, outputCheck: isGetNextReleaseVersionStepOutput })
  }

  async runDeployStep(input: DeployStepInput): Promise<void> {
    // Deploy step doesn't require any specific output format, so we use a function that always returns true
    // This allows the step to complete successfully regardless of what (if anything) the deployment script outputs
    await this.getCommandFromUserAndRun({ step: "deploy", input, outputCheck: () => true })
  }

  async getCommandFromUserAndRun<Output>(
    { step, input, outputCheck }: { step: AnyStepName; input: AnyStepInput; outputCheck: (output: unknown) => boolean },
  ): Promise<Output | null> {
    const commands = this.environment.getCommandsForStep({ stepName: step })

    if (!commands) return null

    // cumulativeOutput accumulates the valid output of all scripts run so far.
    // It is merged into the template data when rendering each subsequent command string,
    // so users can reference prior output directly: e.g. `foo --version {{ versionName }}`.
    // cumulativeOutput fields are spread alongside the original input — if a field name collides,
    // the original input wins so scripts cannot shadow decaf's own input values.
    // The original input is passed unchanged to exec.run — scripts receive only what decaf always sends.
    let cumulativeOutput: Record<string, unknown> = {}

    for (const command of commands) {
      // cumulativeOutput is spread first so original input fields always take precedence on conflicts.
      const templateData = { ...cumulativeOutput, ...input } as unknown as Record<string, unknown>
      const commandToRun = await renderStringTemplate(command, templateData)

      // input contains all git commits. too much data to log.
      // this.logger.debug(`Running step, ${step}. Input: ${JSON.stringify(input)}. Command: ${commandToRun}`)
      this.logger.debug(`Running step, ${step}. Command: ${commandToRun}`)
      const runResult = await this.exec.run({
        command: commandToRun,
        input: input,
        displayLogs: true,
        currentWorkingDirectory: this.userScriptCurrentWorkingDirectory,
        envVars: {
          DECAF_ROOT_WORKING_DIRECTORY: this.gitRootDirectory,
        },
      })
      this.logger.debug(`Step ${step} completed. step output: ${runResult.output}`)

      // Only accumulate output that passes the validity check — incomplete outputs are ignored.
      // Prefer the comm-file output (runResult.output), fall back to stdout parsed as JSON.
      const rawOutput = runResult.output ?? (jsonParse(runResult.stdout) as Record<string, unknown> | null | undefined)
      if (outputCheck(rawOutput)) {
        cumulativeOutput = { ...cumulativeOutput, ...(rawOutput as Record<string, unknown>) }
      }
    }

    // For deploy: all commands ran successfully, no output to return
    if (step === "deploy") {
      return null
    }

    // Check if the final cumulative output (merged from all scripts) is valid
    if (outputCheck(cumulativeOutput)) {
      return cumulativeOutput as Output
    }

    return null
  }
}
