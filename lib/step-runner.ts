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

    // Run each command in the array
    for (const command of commands) {
      const commandToRun = await renderStringTemplate(command, input as unknown as Record<string, unknown>)

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

      // For deploy step, run all commands without checking output
      if (step === "deploy") {
        continue
      }

      // For non-deploy steps, check if we got valid output
      if (outputCheck(runResult.output)) {
        return runResult.output as Output
      }

      const stdoutAsParsedJSON = jsonParse(runResult.stdout)
      if (outputCheck(stdoutAsParsedJSON)) {
        return stdoutAsParsedJSON as Output
      }

      // Output was not valid, continue to next command
    }

    // For deploy: all commands ran successfully
    // For other steps: no command produced valid output
    return null
  }
}
