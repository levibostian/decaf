import { exec } from "./exec.ts"
import * as log from "./log.ts"
import { AnyStepName } from "./steps/types/any-step.ts"

export interface GitHubActions {
  getNameOfCurrentBranch(): string
  getSimulatedMergeType(): "merge" | "rebase" | "squash"
  getEventThatTriggeredThisRun(): "push" | "pull_request" | unknown
  isRunningInPullRequest(): Promise<{ baseBranch: string; targetBranch: string; prTitle: string; prDescription: string } | undefined>
  getCommandForStep({ stepName }: { stepName: AnyStepName }): string | undefined
  failOnDeployVerification(): boolean
  getGitConfigInput(): { name: string; email: string } | undefined
  setOutput({ key, value }: { key: string; value: string }): Promise<void>
}

export class GitHubActionsImpl implements GitHubActions {
  getNameOfCurrentBranch(): string {
    const githubRef = Deno.env.get("GITHUB_REF")!
    log.debug(`GITHUB_REF: ${githubRef}`)

    // if the ref starts with "refs/pull/", then it's a pull request.
    // the tool is only compatible with branch names that start with "refs/heads/".
    // We need a different way to get the branch name.
    if (githubRef.startsWith("refs/pull/")) {
      const githubHeadRef = Deno.env.get("GITHUB_HEAD_REF")!
      log.debug(`GITHUB_HEAD_REF: ${githubHeadRef}`)
      return githubHeadRef
    }

    return githubRef.replace("refs/heads/", "")
  }

  getSimulatedMergeType(): "merge" | "rebase" | "squash" {
    const githubActionInputKey = "simulated_merge_type"

    const simulateMergeType = this.getInput(githubActionInputKey)
    if (!simulateMergeType) {
      return "merge"
    }

    if (simulateMergeType !== "merge" && simulateMergeType !== "rebase" && simulateMergeType !== "squash") {
      log.error(
        `The value for the GitHub Actions input ${githubActionInputKey} is invalid. The value must be either "merge", "rebase", or "squash". The value provided was: ${simulateMergeType}`,
      )

      throw new Error()
    }

    return simulateMergeType
  }

  getEventThatTriggeredThisRun(): "push" | "pull_request" | string {
    const eventName = Deno.env.get("GITHUB_EVENT_NAME")

    switch (eventName) {
      case "push":
        return "push"
      case "pull_request":
        return "pull_request"
      default:
        return eventName || "unknown"
    }
  }

  async isRunningInPullRequest(): Promise<{ baseBranch: string; targetBranch: string; prTitle: string; prDescription: string } | undefined> {
    const githubEventName = Deno.env.get("GITHUB_EVENT_NAME")
    if (githubEventName !== "pull_request") {
      return undefined
    }

    // object reference: https://docs.github.com/en/webhooks/webhook-events-and-payloads?actionType=opened#pull_request
    const pullRequestContext = await this.getFullRunContext()! // we can force since we know we are in a pull request event

    const eventData = pullRequestContext.pull_request

    return {
      baseBranch: eventData.head.ref,
      targetBranch: eventData.base.ref,
      prTitle: eventData.title,
      prDescription: eventData.body || "", // github body can be null, we want a string.
    }
  }

  // https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#setting-an-output-parameter
  async setOutput({ key, value }: { key: string; value: string }): Promise<void> {
    await exec.run({
      command: `echo "${key}=${value}" >> "$GITHUB_OUTPUT"`,
      input: undefined,
    })
  }

  failOnDeployVerification(): boolean {
    return this.getInput("fail_on_deploy_verification") === "true"
  }

  getGitConfigInput(): { name: string; email: string } | undefined {
    const gitConfigInput = this.getInput("git_config")
    if (!gitConfigInput || gitConfigInput.trim() === "") {
      return undefined
    }

    // Expect format: "Name <email>"
    const match = gitConfigInput.match(/^(.*)\s+<([^>]+)>$/)
    if (!match) {
      log.error(
        `The git_config input must be in the format "name <email>". The value provided was: ${gitConfigInput}`,
      )
      throw new Error()
    }

    const name = match[1].trim()
    const email = match[2].trim()

    return { name, email }
  }

  getCommandForStep({ stepName }: { stepName: string }): string | undefined {
    const command = this.getInput(stepName)
    if (!command) return undefined
    return command
  }

  private async getFullRunContext(): Promise<any | undefined> {
    const eventPath = Deno.env.get("GITHUB_EVENT_PATH")
    if (eventPath) {
      const fileContents = new TextDecoder("utf-8").decode(Deno.readFileSync(eventPath))
      return JSON.parse(fileContents)
    }
  }

  private getInput(key: string): string {
    const val: string = Deno.env.get(`INPUT_${key.replace(/ /g, "_").toUpperCase()}`) || ""
    if (!val) {
      throw new Error(`The GitHub Actions input "${key}" is not set.`)
    }

    return val.trim()
  }
}
