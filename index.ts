import { run } from "./deploy.ts"
import { GitHubApiImpl } from "./lib/github-api.ts"
import { DeployStepImpl } from "./lib/steps/deploy.ts"
import { GetCommitsSinceLatestReleaseStepImpl } from "./lib/steps/get-commits-since-latest-release.ts"
import { exec } from "./lib/exec.ts"
import { git } from "./lib/git.ts"
import { logger } from "./lib/log.ts"
import { EnvironmentImpl } from "./lib/environment.ts"
import { SimulateMergeImpl } from "./lib/simulate-merge.ts"
import { PrepareTestModeEnvStepImpl } from "./lib/steps/prepare-testmode-env.ts"
import { StepRunnerImpl } from "./lib/step-runner.ts"
import { ConvenienceStepImpl } from "./lib/steps/convenience.ts"
import { processCommandLineArgs } from "./cli.ts"

// After args are processed, they are available to the environment module.
processCommandLineArgs(Deno.args)

const githubApi = GitHubApiImpl
const environment = new EnvironmentImpl()
const pullRequestInfo = environment.isRunningInPullRequest()
const buildInfo = environment.getBuild()
const simulatedMergeType = environment.getSimulatedMergeType()
const shouldPostStatusUpdatesOnPullRequest = environment.getUserConfigurationOptions().makePullRequestComment && pullRequestInfo !== undefined
const { owner, repo } = environment.getRepository()

if (shouldPostStatusUpdatesOnPullRequest) {
  await githubApi.postStatusUpdateOnPullRequest({
    message: `## New deployment tool
Running deployments in test mode. Results will appear below. 
If this pull request and all of it's parent pull requests are merged using the...`,
    owner,
    repo,
    prNumber: pullRequestInfo.prNumber,
    ciBuildId: buildInfo.buildId,
  })
}

try {
  const runResult = await run({
    convenienceStep: new ConvenienceStepImpl(exec, environment, logger),
    stepRunner: new StepRunnerImpl(environment, exec, logger),
    prepareEnvironmentForTestMode: new PrepareTestModeEnvStepImpl(githubApi, environment, new SimulateMergeImpl(git, exec), git, exec),
    getCommitsSinceLatestReleaseStep: new GetCommitsSinceLatestReleaseStepImpl(githubApi),
    deployStep: new DeployStepImpl(exec),
    log: logger,
    environment,
  })
  const newReleaseVersion = runResult?.nextReleaseVersion

  if (shouldPostStatusUpdatesOnPullRequest) {
    const message = newReleaseVersion
      ? `...🟩 **${simulatedMergeType}** 🟩 merge method... 🚢 The next version of the project will be: **${newReleaseVersion}**`
      : `...🟩 **${simulatedMergeType}** 🟩 merge method... 🌴 It will not trigger a deployment. No new version will be deployed.`

    await githubApi.postStatusUpdateOnPullRequest({
      message,
      owner,
      repo,
      prNumber: pullRequestInfo.prNumber,
      ciBuildId: buildInfo.buildId,
    })
  }
} catch (error) {
  if (shouldPostStatusUpdatesOnPullRequest) {
    await githubApi.postStatusUpdateOnPullRequest({
      message:
        `...🟩 **${simulatedMergeType}** 🟩 merge method... ⚠️ There was an error during deployment run. [See logs to learn more and fix the issue](${buildInfo.buildUrl}).`,
      owner,
      repo,
      prNumber: pullRequestInfo.prNumber,
      ciBuildId: buildInfo.buildId,
    })
  }

  // rethrow the error to ensure the action fails
  throw error
}
