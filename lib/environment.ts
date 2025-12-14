import { exec } from "./exec.ts"
import * as log from "./log.ts"
import { AnyStepName } from "./steps/types/any-step.ts"
import envCi from "env-ci"
import { GitHubApi } from "./github-api.ts"

export interface Environment {
  getRepository(): { owner: string; repo: string }
  getBuild(): { buildUrl?: string; buildId: string; currentBranch: string; ciService: string }
  getSimulatedMergeTypes(): Promise<("merge" | "rebase" | "squash")[]>
  getEventThatTriggeredThisRun(): "push" | "pull_request" | "other"
  isRunningInPullRequest(): { baseBranch: string; targetBranch: string; prNumber: number } | undefined
  getCommandsForStep({ stepName }: { stepName: AnyStepName }): string[] | undefined
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
  private simulatedMergeTypeCache: ("merge" | "rebase" | "squash")[] | null = null
  private readonly githubApi: GitHubApi

  constructor(githubApi: GitHubApi) {
    // Example of the values in `this.env`:
    // {"isCi":true,"name":"GitHub Actions","service":"github","commit":"7d4aec10df2b2dcbe99643662beca90a24a8a81f","build":"15876053587","isPr":true,"branch":"alpha","prBranch":"refs/pull/68/merge","slug":"levibostian/decaf","root":"/home/runner/work/decaf/decaf","pr":68}
    this.env = envCi()
    this.outputFileCache = {}
    this.githubApi = githubApi
  }

  // Note: For pull requests, the return value is pretty useless. Example: "refs/pull/68/merge"
  getNameOfCurrentBranch(): string {
    if (this.env.isPr) return this.env.prBranch
    return this.env.branch
  }

  getBuild(): { buildUrl?: string; buildId: string; currentBranch: string; ciService: string } {
    return {
      buildId: this.env.build,
      buildUrl: this.env.buildUrl,
      currentBranch: this.getNameOfCurrentBranch(),
      ciService: this.env.service,
    }
  }

  getRepository(): { owner: string; repo: string } {
    return {
      owner: this.env.slug.split("/")[0],
      repo: this.env.slug.split("/")[1],
    }
  }

  async getSimulatedMergeTypes(): Promise<("merge" | "rebase" | "squash")[]> {
    // first, check if we have it cached.
    if (this.simulatedMergeTypeCache) {
      return Promise.resolve(this.simulatedMergeTypeCache)
    }

    // Next, check if user provided the type via config.
    const githubActionInputKey = "simulated_merge_type"

    try {
      const simulateMergeType = this.getInput(githubActionInputKey)
      if (simulateMergeType) {
        // Parse comma-separated values and validate each one
        const types = simulateMergeType.split(",")
          .map((type) => type.trim())
          .filter((type) => type !== "")

        const validTypes: ("merge" | "rebase" | "squash")[] = []
        for (const type of types) {
          if (type === "merge" || type === "rebase" || type === "squash") {
            validTypes.push(type)
          }
        }

        // If we have at least one valid type, use them
        if (validTypes.length > 0) {
          this.simulatedMergeTypeCache = validTypes
          return Promise.resolve(validTypes)
        }
      }
    } catch (_error) {
      // Input not set, fall through to GitHub API check
    }

    // Next, try to get the repo's configured merge types from GitHub API.
    try {
      const mergeTypes = await this.githubApi.getRepoMergeTypes({
        owner: this.getRepository().owner,
        repo: this.getRepository().repo,
      })

      log.debug(`Repository merge types retrieved from github api: ${JSON.stringify(mergeTypes)}`)

      const enabledTypes: ("merge" | "rebase" | "squash")[] = []

      if (mergeTypes.allowMergeCommit) {
        enabledTypes.push("merge")
      }
      if (mergeTypes.allowSquashMerge) {
        enabledTypes.push("squash")
      }
      if (mergeTypes.allowRebaseMerge) {
        enabledTypes.push("rebase")
      }

      // If we have at least one valid type, use them.
      // github api will return zero results if the auth token doesn't have "contents: write" access.
      if (enabledTypes.length > 0) {
        this.simulatedMergeTypeCache = enabledTypes
        return enabledTypes
      }
    } catch (error) {
      log.debug(`Failed to get repository merge types from GitHub API: ${error}`)
    }

    // use a default of all types if we can't get the info from the API.
    this.simulatedMergeTypeCache = ["merge", "squash", "rebase"]
    return ["merge", "squash", "rebase"]
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

  getCommandsForStep({ stepName }: { stepName: string }): string[] | undefined {
    try {
      const command = this.getInput(stepName)
      if (!command) return undefined

      // Split by newline and filter out empty lines after trimming
      const commands = command.split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")

      return commands.length > 0 ? commands : undefined
    } catch (_error) {
      // Return undefined if input is not set or parsing fails
      return undefined
    }
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
