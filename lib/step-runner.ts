import { jsonParse, pipe } from "./utils.ts"
import Template from "@deno-library/template"
const stringTemplating = new Template({
  isEscape: false,
})
import { Environment } from "./environment.ts"
import { Exec, RunResult } from "./exec.ts"
import { AnyStepInput, GetLatestReleaseStepInput, GetNextReleaseVersionStepInput } from "./types/environment.ts"
import { AnyStepName } from "./steps/types/any-step.ts"
import {
  GetLatestReleaseStepOutput,
  GetNextReleaseVersionStepOutput,
  isGetLatestReleaseStepOutput,
  isGetNextReleaseVersionStepOutput,
} from "./steps/types/output.ts"
import "./utils.ts"
import { Logger } from "./log.ts"

export interface StepRunner {
  runGetLatestOnCurrentBranchReleaseStep: (input: GetLatestReleaseStepInput) => Promise<GetLatestReleaseStepOutput | null>
  determineNextReleaseVersionStep: (input: GetNextReleaseVersionStepInput) => Promise<GetNextReleaseVersionStepOutput | null>
}

export class StepRunnerImpl implements StepRunner {
  constructor(private environment: Environment, private exec: Exec, private logger: Logger) {}

  runGetLatestOnCurrentBranchReleaseStep(input: GetLatestReleaseStepInput): Promise<GetLatestReleaseStepOutput | null> {
    return this.getCommandFromUserAndRun({ step: "get_latest_release_current_branch", input, outputCheck: isGetLatestReleaseStepOutput })
  }

  determineNextReleaseVersionStep(input: GetNextReleaseVersionStepInput): Promise<GetNextReleaseVersionStepOutput | null> {
    return this.getCommandFromUserAndRun({ step: "get_next_release_version", input, outputCheck: isGetNextReleaseVersionStepOutput })
  }

  async getCommandFromUserAndRun<Output>(
    { step, input, outputCheck }: { step: AnyStepName; input: AnyStepInput; outputCheck: (output: unknown) => boolean },
  ): Promise<Output | null> {
    const commandToRun = pipe(
      this.environment.getCommandForStep({ stepName: step }),
      (command) => command ? stringTemplating.render(command, input as unknown as Record<string, unknown>) : command,
    )

    if (!commandToRun) return null

    this.logger.debug(`Running step, ${step}. Input: ${JSON.stringify(input)}. Command: ${commandToRun}`)
    const runResult = await this.exec.run({ command: commandToRun, input: input, displayLogs: true })
    this.logger.debug(`Step ${step} completed. Result: ${JSON.stringify(runResult)}`)

    if (outputCheck(runResult.output)) {
      return runResult.output as Output
    }

    const stdoutAsParsedJSON = jsonParse(runResult.stdout)
    if (outputCheck(stdoutAsParsedJSON)) {
      return stdoutAsParsedJSON as Output
    }

    return null
  }
}
