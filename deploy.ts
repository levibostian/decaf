import { Logger } from "./lib/log.ts"
import { DeployStep } from "./lib/steps/deploy.ts"
import { GetCommitsSinceLatestReleaseStep } from "./lib/steps/get-commits-since-latest-release.ts"
import { DeployStepInput, GetNextReleaseVersionStepInput } from "./lib/types/environment.ts"
import { Environment } from "./lib/environment.ts"
import { PrepareTestModeEnvStep } from "./lib/steps/prepare-testmode-env.ts"
import { GitHubCommit } from "./lib/github-api.ts"
import { StepRunner } from "./lib/step-runner.ts"
import { ConvenienceStep } from "./lib/steps/convenience.ts"
import { GetLatestReleaseStepOutput } from "./lib/steps/types/output.ts"
import { GitCommit } from "./lib/types/git.ts"

export const run = async ({
  convenienceStep,
  stepRunner,
  prepareEnvironmentForTestMode,
  getCommitsSinceLatestReleaseStep,
  deployStep,
  environment,
  log,
}: {
  convenienceStep: ConvenienceStep
  stepRunner: StepRunner
  prepareEnvironmentForTestMode: PrepareTestModeEnvStep
  getCommitsSinceLatestReleaseStep: GetCommitsSinceLatestReleaseStep
  deployStep: DeployStep
  environment: Environment
  log: Logger
}): Promise<
  { nextReleaseVersion: string | null; commitsSinceLastRelease: GitHubCommit[]; latestRelease: GetLatestReleaseStepOutput | null } | null
> => {
  if (environment.getEventThatTriggeredThisRun() !== "push" && environment.getEventThatTriggeredThisRun() !== "pull_request") {
    log.error(
      `Sorry, you can only trigger this tool from a push or a pull_request. The event that triggered this run was: ${environment.getEventThatTriggeredThisRun()}. Bye bye...`,
    )
    return null
  }

  log.notice(`👋 Hello! I am a tool called decaf. I help you deploy your projects.`)
  log.message(
    `To learn how the deployment process of your project works, I suggest reading all of the logs that I print to you below.`,
  )
  log.message(
    `If you have more questions after reading the logs, you can optionally view the documentation to learn more about the tool: https://github.com/levibostian/decaf/`,
  )
  log.message(`Ok, let's get started with the deployment!`)
  log.message(`--------------------------------`)

  let currentBranch = environment.getBuild().currentBranch
  log.debug(`name of current git branch: ${currentBranch}`)
  const { owner, repo } = environment.getRepository()

  const pullRequestInfo = environment.isRunningInPullRequest()
  const runInTestMode = pullRequestInfo !== undefined
  if (runInTestMode) {
    log.notice(
      `🧪 I see that I got triggered to run from a pull request event. In pull requests, I run in test mode which means that I will run the deployment process but I will not actually deploy anything.`,
    )

    log.notice(
      `🧪 In test mode, I also simulate merging the current pull request and all parent pull requests (Note, I don't actually merge any pull requests). Simulating now...`,
    )
    const prepareEnvironmentForTestModeResults = await prepareEnvironmentForTestMode.prepareEnvironmentForTestMode({
      owner,
      repo,
    })

    const pullRequestBranchBeforeSimulatedMerges = currentBranch
    currentBranch = prepareEnvironmentForTestModeResults?.currentGitBranch || currentBranch

    log.notice(
      `🧪 Simulated merges complete. You will notice that for the remainder of the deployment process, the current branch will be ${currentBranch} instead of the pull request branch ${pullRequestBranchBeforeSimulatedMerges}.`,
    )
  }

  await environment.setOutput({ key: "test_mode_on", value: runInTestMode.toString() })

  const { gitCommitsAllLocalBranches, gitCommitsCurrentBranch } = await convenienceStep.runConvenienceCommands(
    environment.getBranchFilters(),
    environment.getCommitLimit(),
  )

  log.notice(
    `👀 I see that the git branch ${currentBranch} is checked out. We will begin the deployment process from the latest commit of this branch.`,
  )

  log.notice(
    `🔍 First, I need to get the latest release that was created on the git branch ${currentBranch}. I'll look for it now...`,
  )

  const lastRelease = await stepRunner.runGetLatestOnCurrentBranchReleaseStep({
    gitCurrentBranch: currentBranch,
    gitRepoOwner: owner,
    gitRepoName: repo,
    testMode: runInTestMode,
    gitCommitsCurrentBranch,
    gitCommitsAllLocalBranches,
  })

  log.debug(`Latest release on branch ${currentBranch} is: ${JSON.stringify(lastRelease)}`)

  if (!lastRelease) {
    log.message(
      `I have been told that the git branch, ${currentBranch}, has never been released before. This will be the first release. Exciting!`,
    )
  } else {
    log.message(
      `I have been told that the latest release on the git branch ${currentBranch} is: ${lastRelease.versionName}`,
    )
  }

  log.notice(
    `📜 Next, I need to know all of the changes (git commits) that have been done on git branch ${currentBranch} since the latest release: ${lastRelease?.versionName}, commit: ${
      lastRelease?.commitSha.slice(0, 10)
    }. I'll look for them now...`,
  )

  const listOfCommits = await getCommitsSinceLatestReleaseStep
    .getAllCommitsSinceGivenCommit({
      owner,
      repo,
      branch: currentBranch,
      latestRelease: lastRelease,
    })

  if (listOfCommits.length === 0) {
    log.warning(
      `Looks like zero commits have been created since the latest release. This means there is no new code created and therefore, the deployment process stops here. Bye-bye 👋!`,
    )
    return { nextReleaseVersion: null, commitsSinceLastRelease: listOfCommits, latestRelease: lastRelease }
  }
  log.debug(`Newest commit found: ${JSON.stringify(listOfCommits[0])}`)
  log.debug(
    `Oldest commit found: ${JSON.stringify(listOfCommits[listOfCommits.length - 1])}`,
  )

  log.message(
    `I found ${listOfCommits.length} git commits created since ${
      lastRelease ? `the latest release of ${lastRelease.versionName}` : `the git branch ${currentBranch} was created`
    }.`,
  )

  log.notice(
    `📊 Now I need to know (1) if any of these new commits need to be deployed and (2) if they should, what should the new version be. To determine this, I will analyze each git commit one-by-one...`,
  )

  const determineNextReleaseVersionEnvironment: GetNextReleaseVersionStepInput = {
    gitCurrentBranch: currentBranch,
    gitRepoOwner: owner,
    gitRepoName: repo,
    testMode: runInTestMode,
    gitCommitsSinceLastRelease: listOfCommits,
    lastRelease,
    gitCommitsAllLocalBranches,
    gitCommitsCurrentBranch,
  }

  const nextReleaseVersion = (await stepRunner.determineNextReleaseVersionStep(determineNextReleaseVersionEnvironment))?.version

  if (!nextReleaseVersion) {
    log.warning(
      `After analyzing all of the git commits, none of the commits need to be deployed. Therefore, the deployment process stops here with no new release to be made. Bye-bye 👋!`,
    )
    return { nextReleaseVersion: null, commitsSinceLastRelease: listOfCommits, latestRelease: lastRelease }
  }
  log.message(
    `After analyzing all of the git commits, I have determined the next release version will be: ${nextReleaseVersion}`,
  )

  log.notice(
    `🚢 It's time to ship ${nextReleaseVersion}! I will now run all of the deployment commands provided in your project's configuration file...`,
  )

  const deployEnvironment: DeployStepInput = { ...determineNextReleaseVersionEnvironment, nextVersionName: nextReleaseVersion }

  await deployStep.runDeploymentCommands({
    environment: deployEnvironment,
  })

  // Re-run get-latest-release step to verify the new release
  log.notice(
    `🔄 Verifying that the new release was created by re-running the get-latest-release step...`,
  )
  const latestReleaseAfterDeploy = await stepRunner.runGetLatestOnCurrentBranchReleaseStep({
    gitCurrentBranch: currentBranch,
    gitRepoOwner: owner,
    gitRepoName: repo,
    testMode: runInTestMode,
    gitCommitsCurrentBranch,
    gitCommitsAllLocalBranches,
  })
  log.debug(`Latest release after deploy: ${JSON.stringify(latestReleaseAfterDeploy)}`)

  if (latestReleaseAfterDeploy?.versionName === nextReleaseVersion) {
    log.notice(
      `✅ Verification successful! The latest release is now ${latestReleaseAfterDeploy.versionName}, which matches the version that was just deployed.`,
    )
  } else {
    if (runInTestMode) {
      log.warning(
        `⚠️ Verification failed, but that could be expected in test mode. The latest release after deployment is ${
          latestReleaseAfterDeploy?.versionName ?? "<none>"
        }, but expected ${nextReleaseVersion}. This could indicate a problem with the deployment process.`,
      )
    } else {
      log.error(
        `❌ Verification failed! The latest release after deployment is ${
          latestReleaseAfterDeploy?.versionName ?? "<none>"
        }, but expected ${nextReleaseVersion}. This could indicate a problem with the deployment process.`,
      )

      if (environment.getUserConfigurationOptions().failOnDeployVerification) {
        throw new Error(
          `Deployment verification failed: latest release is ${latestReleaseAfterDeploy?.versionName ?? "<none>"}, expected ${nextReleaseVersion}`,
        )
      }
    }
  }

  log.notice(
    `🎉 Congratulations! The deployment process has completed. Bye-bye 👋!`,
  )

  await environment.setOutput({ key: "new_release_version", value: nextReleaseVersion })

  return { nextReleaseVersion, commitsSinceLastRelease: listOfCommits, latestRelease: lastRelease }
}
