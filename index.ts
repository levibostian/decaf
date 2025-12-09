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

// put all the logic in a main function so that the e2e tests can run the
// function and be able to have a clean environment for each test. If all this code was defined
// at the top level, the e2e tests would not be able to reset the DI graph between tests.
// Was using dynamic imports in the e2e tests, but code coverage didn't recognize any of this code then.
export async function main() {
  // After args are processed, they are available to the environment module.
  processCommandLineArgs(Deno.args)

  // DI resolution happens here, after any test overrides have been applied
  const diGraph = di.getGraph()
  const githubApi = diGraph.get("github")
  const environment = diGraph.get("environment")
  const gitRepo = diGraph.get("gitRepoManager")

  const pullRequestInfo = environment.isRunningInPullRequest()
  const buildInfo = environment.getBuild()
  let simulatedMergeTypes = await environment.getSimulatedMergeTypes()
  const isInTestMode = environment.isRunningInPullRequest() !== undefined
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

  // If we are actually running a deployment (not test mode), we need the run() function to only run once.
  // so, modify the for loop to only run once.
  if (!isInTestMode) {
    simulatedMergeTypes = ["merge"] // this could be any value, doesn't matter. We're not doing any merges in non-test mode.
  }
  for (const simulatedMergeType of simulatedMergeTypes) {
    let git
    let isolatedCloneDirectory: string | undefined

    if (isInTestMode) {
      const cloneResult = await gitRepo.getIsolatedClone()
      git = cloneResult.git
      isolatedCloneDirectory = cloneResult.directory
    } else {
      // In non-test mode, get a Git instance for the current directory (no clone needed)
      git = gitRepo.getCurrentRepo()
      isolatedCloneDirectory = undefined
    }

    // Run a complete git fetch in the isolated clone.
    // Many git commands in this tool depend on it, so run it early to avoid any issues.
    await git.fetch()

    try {
      const runResult = await run({
        convenienceStep: new ConvenienceStepImpl(environment, git, logger),
        stepRunner: new StepRunnerImpl(environment, exec, logger),
        prepareEnvironmentForTestMode: new PrepareTestModeEnvStepImpl(githubApi, environment, new SimulateMergeImpl(git), git),
        getCommitsSinceLatestReleaseStep: new GetCommitsSinceLatestReleaseStepImpl(git),
        log: logger,
        git,
        environment,
        simulatedMergeType,
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
      // Only clean up if we created an isolated clone (test mode only)
      if (isolatedCloneDirectory) {
        try {
          await gitRepo.removeIsolatedClone(isolatedCloneDirectory)
        } catch (cleanupError) {
          logger.warning(`Failed to remove isolated git clone at ${isolatedCloneDirectory}: ${cleanupError}`)
        }
      }
    }
  }
}

// Only run main when this file is executed directly
if (import.meta.main) {
  await main()
}
