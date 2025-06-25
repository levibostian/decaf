import { exec } from "./exec.ts"
import * as log from "./log.ts"
import { AnyStepName } from "./steps/types/any-step.ts"
import envCi from "env-ci"

export interface GitHubActions {
  getNameOfCurrentBranch(): string
  getSimulatedMergeType(): "merge" | "rebase" | "squash"
  getEventThatTriggeredThisRun(): "push" | "pull_request" | "other"
  isRunningInPullRequest(): { baseBranch: string; targetBranch: string; prNumber: number } | undefined
  getCommandForStep({ stepName }: { stepName: AnyStepName }): string | undefined
  failOnDeployVerification(): boolean
  getGitConfigInput(): { name: string; email: string } | undefined
  setOutput({ key, value }: { key: string; value: string }): Promise<void>
}

export class GitHubActionsImpl implements GitHubActions {
  private readonly env: Record<string, string>
  private outputFileCache: Record<string, string>

  constructor() {
    // Example of the values in `this.env`:
    // {"isCi":true,"name":"GitHub Actions","service":"github","commit":"7d4aec10df2b2dcbe99643662beca90a24a8a81f","build":"15876053587","isPr":true,"branch":"alpha","prBranch":"refs/pull/68/merge","slug":"levibostian/new-deployment-tool","root":"/home/runner/work/new-deployment-tool/new-deployment-tool","pr":68}
    this.env = envCi()
    this.outputFileCache = {}
  }

  // Note: For pull requests, the return value is pretty useless. Example: "refs/pull/68/merge"
  getNameOfCurrentBranch(): string {
    if (this.env.isPr) return this.env.prBranch
    return this.env.branch
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

  getEventThatTriggeredThisRun(): "push" | "pull_request" | "other" {
    if (this.env.isPr) return "pull_request"
    if (this.env.branch) return "push"

    return "other"
  }

  isRunningInPullRequest(): { baseBranch: string; targetBranch: string; prNumber: number } | undefined {
    if (!this.env.isPr) {
      return undefined
    }

    return {
      baseBranch: this.env.prBranch,
      targetBranch: this.env.branch,
      prNumber: this.env.pr as unknown as number,
    }
  }

  async setOutput({ key, value }: { key: string; value: string }): Promise<void> {
    await this.setOutputFile(key, value)

    if (this.env.service == "github") {
      await exec.run({
        command: `echo "${key}=${value}" >> "$GITHUB_OUTPUT"`,
        input: undefined,
      })
    }

    // Open to adding other CI services in the future, if they have a simple system for setting outputs.
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

  private getInput(key: string): string {
    const val: string = Deno.env.get(`INPUT_${key.replace(/ /g, "_").toUpperCase()}`) || ""
    if (!val) {
      throw new Error(`The GitHub Actions input "${key}" is not set.`)
    }

    return val.trim()
  }

  // Writes output to a file as a way to support other CI services that are not github actions.
  private async setOutputFile(key: string, value: string): Promise<void> {
    const nameOfOutputFile = Deno.env.get("INPUT_OUTPUT_FILE")
    if (!nameOfOutputFile || nameOfOutputFile.trim() === "") return

    this.outputFileCache[key] = value

    await Deno.writeFile(
      nameOfOutputFile,
      new TextEncoder().encode(JSON.stringify(this.outputFileCache, null, 2)),
    )
  }
}
