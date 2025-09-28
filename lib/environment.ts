import { exec } from "./exec.ts"
import * as log from "./log.ts"
import { AnyStepName } from "./steps/types/any-step.ts"
import envCi from "env-ci"

export interface Environment {
  getRepository(): { owner: string; repo: string }
  getBuild(): { buildUrl?: string; buildId: string; currentBranch: string }
  getSimulatedMergeType(): "merge" | "rebase" | "squash"
  getEventThatTriggeredThisRun(): "push" | "pull_request" | "other"
  isRunningInPullRequest(): { baseBranch: string; targetBranch: string; prNumber: number } | undefined
  getCommandForStep({ stepName }: { stepName: AnyStepName }): string | undefined
  getGitConfigInput(): { name: string; email: string } | undefined
  getBranchFilters(): string[]
  getCommitLimit(): number
  setOutput({ key, value }: { key: string; value: string }): Promise<void>
  // A catch-all method to get inputs that dont match the other methods.
  getUserConfigurationOptions(): { failOnDeployVerification: boolean; makePullRequestComment: boolean }
}

export class EnvironmentImpl implements Environment {
  private readonly env: Record<string, string>
  private outputFileCache: Record<string, string>

  constructor() {
    // Example of the values in `this.env`:
    // {"isCi":true,"name":"GitHub Actions","service":"github","commit":"7d4aec10df2b2dcbe99643662beca90a24a8a81f","build":"15876053587","isPr":true,"branch":"alpha","prBranch":"refs/pull/68/merge","slug":"levibostian/decaf","root":"/home/runner/work/decaf/decaf","pr":68}
    this.env = envCi()
    this.outputFileCache = {}
  }

  // Note: For pull requests, the return value is pretty useless. Example: "refs/pull/68/merge"
  getNameOfCurrentBranch(): string {
    if (this.env.isPr) return this.env.prBranch
    return this.env.branch
  }

  getBuild(): { buildUrl?: string; buildId: string; currentBranch: string } {
    let buildUrl = this.env.buildUrl

    // workaround because github actions doesn't set the build URL correctly
    // fix: https://github.com/semantic-release/env-ci/pull/194
    if (this.env.service === "github") {
      buildUrl = `${Deno.env.get("GITHUB_SERVER_URL")}/${Deno.env.get("GITHUB_REPOSITORY")}/actions/runs/${Deno.env.get("GITHUB_RUN_ID")}`
    }

    return {
      buildId: this.env.build,
      buildUrl,
      currentBranch: this.getNameOfCurrentBranch(),
    }
  }

  getRepository(): { owner: string; repo: string } {
    return {
      owner: this.env.slug.split("/")[0],
      repo: this.env.slug.split("/")[1],
    }
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
      prNumber: Number(this.env.pr), // module provides this as a string, but we want it as a number.
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

  getUserConfigurationOptions(): { failOnDeployVerification: boolean; makePullRequestComment: boolean } {
    return {
      failOnDeployVerification: this.getInput("fail_on_deploy_verification") === "true",
      makePullRequestComment: this.getInput("make_pull_request_comment") === "true",
    }
  }

  getBranchFilters(): string[] {
    let branchFilters: string[] = []
    try {
      const input = this.getInput("branch_filters")

      // Smart comma splitting that respects brace nesting for glob patterns like {main,develop}
      // This allows patterns like "main,feature/{new,old}/*,develop" to work correctly
      const result: string[] = []
      let current = ""
      let braceDepth = 0

      // Parse each character to track when we're inside braces
      for (let i = 0; i < input.length; i++) {
        const char = input[i]

        if (char === "{") {
          // Entering a brace group - increase depth
          braceDepth++
          current += char
        } else if (char === "}") {
          // Exiting a brace group - decrease depth
          braceDepth--
          current += char
        } else if (char === "," && braceDepth === 0) {
          // Only split on commas when we're not inside braces
          // This preserves brace patterns like {main,develop}
          const trimmed = current.trim()
          if (trimmed !== "") {
            result.push(trimmed)
          }
          current = ""
        } else {
          // Regular character - add to current segment
          current += char
        }
      }

      // Don't forget the last segment after the loop
      const trimmed = current.trim()
      if (trimmed !== "") {
        result.push(trimmed)
      }

      branchFilters = result
    } catch (_error) {
      // Ignore errors - return empty array if input parsing fails
    }

    if (!branchFilters || branchFilters.length === 0) {
      return [] // Empty array means get all branches
    }

    return branchFilters
  }

  getCommitLimit(): number {
    const defaultCommitLimit = 500 // Default fallback value

    try {
      const input = this.getInput("commit_limit")
      if (!input) {
        return defaultCommitLimit // Return default if input is empty
      }

      const parsed = parseInt(input, 10)

      // Validate the parsed value
      if (isNaN(parsed) || parsed <= 0) {
        return defaultCommitLimit // Default fallback
      }

      return parsed
    } catch (_error) {
      return defaultCommitLimit // Default fallback on error
    }
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
