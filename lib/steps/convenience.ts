import { Exec, exec } from "../exec.ts"
import { Environment } from "../environment.ts"
import { Logger } from "../log.ts"
import { GitCommit } from "../types/git.ts"
import { Git } from "../git.ts"

/**
 * To make life easier for the user, we perform some prep to avoid common issues that can happen when running commands on
 * a CI server.
 *
 * One goal of this project is to deploy your code quickly and easily. One way to do that is avoid a lot of the gotchas.
 */
export interface ConvenienceStep {
  runConvenienceCommands(): Promise<{
    gitCommitsCurrentBranch: GitCommit[]
    gitCommitsAllLocalBranches: { [branchName: string]: GitCommit[] }
  }>
}

export class ConvenienceStepImpl implements ConvenienceStep {
  constructor(private exec: Exec, private environment: Environment, private git: Git, private log: Logger) {}

  async runConvenienceCommands(): Promise<{
    gitCommitsCurrentBranch: GitCommit[]
    gitCommitsAllLocalBranches: { [branchName: string]: GitCommit[] }
  }> {
    this.log.debug(`Running convenience commands...`)

    // Perform a git fetch to allow user to checkout a branch in their deployment commands.
    await this.exec.run({
      command: `git fetch`,
      input: undefined,
    })

    // Set the git user name and email so the user can create commits in their deployment commands.
    const userProvidedGitCommitterConfig = this.environment.getGitConfigInput()
    if (userProvidedGitCommitterConfig) {
      this.log.debug(`User provided git committer config: ${JSON.stringify(userProvidedGitCommitterConfig)}`)
      this.log.notice(
        `I will set the git committer config to the user provided values: name: ${userProvidedGitCommitterConfig.name}, email: ${userProvidedGitCommitterConfig.email}`,
      )
      await this.exec.run({
        command: `git config user.name "${userProvidedGitCommitterConfig.name}"`,
        input: undefined,
      })
      await this.exec.run({
        command: `git config user.email "${userProvidedGitCommitterConfig.email}"`,
        input: undefined,
      })
    }

    this.log.debug(`Getting commits for all branches and parsing commits...`)
    const gitCommitsAllLocalBranches: { [branchName: string]: GitCommit[] } = {}
    const allLocalBranches = await this.git.getLocalBranches({ exec })
    for (const branch of allLocalBranches) {
      const commitsOnBranch = await this.git.getCommits({ exec, branch })
      gitCommitsAllLocalBranches[branch] = commitsOnBranch
    }
    const gitCommitsCurrentBranch = gitCommitsAllLocalBranches[await this.git.getCurrentBranch({ exec })]

    return {
      gitCommitsCurrentBranch,
      gitCommitsAllLocalBranches,
    }
  }
}
