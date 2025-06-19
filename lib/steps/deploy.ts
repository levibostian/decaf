import { Exec } from "../exec.ts"
import * as log from "../log.ts"
import { DeployStepInput } from "../types/environment.ts"
import Template from "@deno-library/template"
const stringTemplating = new Template({
  isEscape: false,
})

/**
 * Run the deployment commands that the user has provided in the github action workflow yaml file.
 *
 * This is the opportunity for the user to run any commands they need to deploy their project.
 * The main parts of this step:
 * 1. Run the commands the user has provided. Exit early if any fail.
 * 2. Provide data to the command and parse data that the command sends back to us.
 * 3. Add any files that the user has specified to git. We add and create a commit for them.
 * User may need to modify metadata of their project before deploying. Creating a git commit may be required to do that.
 * The tool performs all of the git operations (add, commit, push) for the user. Why?...
 * 1. The tool needs to have control over the git commit created so it can create the git tag pointing to that commit.
 * 2. Convenience for the user. No need for them to run all of these commands themselves. Including setting the author. They may forget something.
 * 3. If the user is running multiple commands for deployment, there is a chance that multiple commands create commits. That just makes this tool more complex.
 */
export interface DeployStep {
  runDeploymentCommands({ environment }: {
    environment: DeployStepInput
  }): Promise<void>
}

export class DeployStepImpl implements DeployStep {
  constructor(private exec: Exec) {}

  async runDeploymentCommands({ environment }: {
    environment: DeployStepInput
  }): Promise<void> {
    const deployCommand = Deno.env.get("INPUT_DEPLOY")?.trim()
      ? stringTemplating.render(
        Deno.env.get("INPUT_DEPLOY") as string,
        environment as unknown as Record<string, unknown>,
      )
      : undefined

    if (deployCommand) {
      const { exitCode, output: outputRecord } = await this.exec.run({
        command: deployCommand,
        input: environment,
        displayLogs: true,
        throwOnNonZeroExitCode: false,
      })
      // const output: DeployCommandOutput | undefined = isDeployCommandOutput(outputRecord) ? outputRecord : undefined

      if (exitCode !== 0) {
        log.error(
          `Deploy command, ${deployCommand}, failed with error code: ${exitCode}`,
        )
        log.error(
          `I will stop the deployment process now. Review the logs to see if this is an issue you need to fix before you retry the deployment again. Otherwise, simply retry running the deployment again later.`,
        )

        throw new Error(
          `Deploy command, ${deployCommand}, failed with error code ${exitCode}.`,
        )
      }
    }
  }
}
