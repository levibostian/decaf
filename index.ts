import { run } from "./deploy.ts"
import { GetCommitsSinceLatestReleaseStepImpl } from "./lib/steps/get-commits-since-latest-release.ts"
import { exec } from "./lib/exec.ts"
import { logger } from "./lib/log.ts"
import { SimulateMergeImpl } from "./lib/simulate-merge.ts"
import { PrepareTestModeEnvStepImpl } from "./lib/steps/prepare-testmode-env.ts"
import { StepRunnerImpl } from "./lib/step-runner.ts"
import { ConvenienceStepImpl } from "./lib/steps/convenience.ts"
import { processCommandLineArgs } from "./cli.ts"
import * as di from "./lib/di.ts"

// After args are processed, they are available to the environment module.
processCommandLineArgs(Deno.args)

// DI resolution happens here, after any test overrides have been applied
const diGraph = di.getGraph()
const githubApi = diGraph.get("github")
const environment = diGraph.get("environment")
const git = diGraph.get("git")

const pullRequestInfo = environment.isRunningInPullRequest()
const buildInfo = environment.getBuild()
const simulatedMergeTypes = await environment.getSimulatedMergeTypes()
const shouldPostStatusUpdatesOnPullRequest = environment.getUserConfigurationOptions().makePullRequestComment && pullRequestInfo !== undefined

const { owner, repo } = environment.getRepository()

if (shouldPostStatusUpdatesOnPullRequest) {
  await githubApi.postStatusUpdateOnPullRequest({
    message: `## decaf
Running deployments in test mode. Results will appear below. 
If this pull request and all of it's parent pull requests are merged using the...`,
    owner,
    repo,
    prNumber: pullRequestInfo.prNumber,
    ciBuildId: buildInfo.buildId,
    ciService: buildInfo.ciService,
  })
}

for (const simulatedMergeType of simulatedMergeTypes) {
  const isolatedCloneDirectory = await git.createIsolatedClone({exec})
  
  // Run a complete git fetch in the isolated clone.
  // Many git commands in this tool depend on it, so run it early to avoid any issues.
  await git.fetch({ exec, cwd: isolatedCloneDirectory })
  
  try {
    const runResult = await run({
      convenienceStep: new ConvenienceStepImpl(exec, environment, git, logger, isolatedCloneDirectory),
      stepRunner: new StepRunnerImpl(environment, exec, logger),
      prepareEnvironmentForTestMode: new PrepareTestModeEnvStepImpl(githubApi, environment, new SimulateMergeImpl(git, exec, isolatedCloneDirectory), git, exec, isolatedCloneDirectory),
      getCommitsSinceLatestReleaseStep: new GetCommitsSinceLatestReleaseStepImpl(git, exec, isolatedCloneDirectory),
      log: logger,
      git,
      exec,
      environment,
      simulatedMergeType,
      gitWorktreeDirectory: isolatedCloneDirectory, // isolated git clone directory - all git operations run here without affecting main repo
    })
    const newReleaseVersion = runResult?.nextReleaseVersion

    if (shouldPostStatusUpdatesOnPullRequest) {
      let message = newReleaseVersion
        ? `...🟩 **${simulatedMergeType}** 🟩 merge method... 🚢 The next version of the project will be: **${newReleaseVersion}**`
        : `...🟩 **${simulatedMergeType}** 🟩 merge method... 🌴 It will not trigger a deployment. No new version will be deployed.`

      message += `\n\n<details>
  <summary>Learn more</summary>
  <br>
  Latest release: ${runResult?.latestRelease?.versionName || "none, this is the first release."}<br>
  Commit of latest release: ${runResult?.latestRelease?.commitSha || "none, this is the first release."}<br>
  <br>
  Commits since last release:<br>
  - ${runResult?.commitsSinceLastRelease.map((commit) => commit.message).join("<br>- ") || "none"}    
  </details>`

      await githubApi.postStatusUpdateOnPullRequest({
        message,
        owner,
        repo,
        prNumber: pullRequestInfo.prNumber,
        ciBuildId: buildInfo.buildId,
        ciService: buildInfo.ciService,
      })
    }
  } catch (error) {
    if (shouldPostStatusUpdatesOnPullRequest) {
      let message = `...🟩 **${simulatedMergeType}** 🟩 merge method... ⚠️ There was an error during deployment run.`
      if (buildInfo.buildUrl) {
        message += ` [See logs to learn more and fix the issue](${buildInfo.buildUrl}).`
      } else {
        message += ` See CI server logs to learn more and fix the issue.`
      }

      await githubApi.postStatusUpdateOnPullRequest({
        message,
        owner,
        repo,
        prNumber: pullRequestInfo.prNumber,
        ciBuildId: buildInfo.buildId,
        ciService: buildInfo.ciService,
      })
    }

    // rethrow the error to ensure the action fails
    throw error
  } finally {
    // Always clean up the isolated git clone, even if an error occurred
    try {
      await git.removeIsolatedClone({ exec, directory: isolatedCloneDirectory })
    } catch (cleanupError) {
      logger.warning(`Failed to remove isolated git clone at ${isolatedCloneDirectory}: ${cleanupError}`)
    }
  }
}
