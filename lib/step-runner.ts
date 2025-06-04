import { jsonParse, pipe } from "./utils.ts"
import Template from "@deno-library/template"
const stringTemplating = new Template({
  isEscape: false,
})
import { GitHubActions } from "./github-actions.ts"
import { Exec, RunResult } from "./exec.ts"
import { AnyStepInput, GetLatestReleaseStepInput } from "./types/environment.ts"
import { AnyStepName } from "./steps/types/any-step.ts"
import { GetLatestReleaseStepOutput, isGetLatestReleaseStepOutput } from "./steps/types/output.ts"
import "./utils.ts"
import { Logger } from "./log.ts"

export interface StepRunner {
  runGetLatestOnCurrentBranchReleaseStep: (input: GetLatestReleaseStepInput) => Promise<GetLatestReleaseStepOutput | null>
}

export class StepRunnerImpl implements StepRunner {
  constructor(private githubActions: GitHubActions, private exec: Exec, private logger: Logger) {}

  async runGetLatestOnCurrentBranchReleaseStep(input: GetLatestReleaseStepInput): Promise<GetLatestReleaseStepOutput | null> {
    const commandExecutionResult = await this.getCommandFromUserAndRun({ step: "get_latest_release_current_branch", input })
    if (commandExecutionResult == null) return null

    if (isGetLatestReleaseStepOutput(commandExecutionResult.output)) {
      return commandExecutionResult.output
    }

    const stdoutAsParsedJSON = jsonParse(commandExecutionResult.stdout)
    if (isGetLatestReleaseStepOutput(stdoutAsParsedJSON)) {
      return stdoutAsParsedJSON
    }

    return null
  }

  async getCommandFromUserAndRun({ step, input }: { step: AnyStepName; input: AnyStepInput }): Promise<RunResult | null> {
    const commandToRun = pipe(
      this.githubActions.getCommandForStep({ stepName: step }),
      (command) => command ? stringTemplating.render(command, input as unknown as Record<string, unknown>) : command,
    )

    if (!commandToRun) return null

    this.logger.debug(`Running step, ${step}. Input: ${JSON.stringify(input)}. Command: ${commandToRun}`)
    const runResult = await this.exec.run({ command: commandToRun, input: input })
    this.logger.debug(`Step ${step} completed. Result: ${JSON.stringify(runResult)}`)

    return runResult
  }
}
