import { Logger } from "./lib/log.ts"
import { DeployStep } from "./lib/steps/deploy.ts"
import { GetCommitsSinceLatestReleaseStep } from "./lib/steps/get-commits-since-latest-release.ts"
import { DeployStepInput, GetNextReleaseVersionStepInput } from "./lib/types/environment.ts"
import { GitHubActions } from "./lib/github-actions.ts"
import { PrepareTestModeEnvStep } from "./lib/steps/prepare-testmode-env.ts"
import { GitHubCommit } from "./lib/github-api.ts"
import { StepRunner } from "./lib/step-runner.ts"

export const run = async ({
  stepRunner,
  prepareEnvironmentForTestMode,
  getCommitsSinceLatestReleaseStep,
  deployStep,
  githubActions,
  log,
}: {
  stepRunner: StepRunner
  prepareEnvironmentForTestMode: PrepareTestModeEnvStep
  getCommitsSinceLatestReleaseStep: GetCommitsSinceLatestReleaseStep
  deployStep: DeployStep
  githubActions: GitHubActions
  log: Logger
}): Promise<void> => {
  if (githubActions.getEventThatTriggeredThisRun() !== "push" && githubActions.getEventThatTriggeredThisRun() !== "pull_request") {
    log.error(
      `Sorry, you can only trigger this tool from a push or a pull_request. The event that triggered this run was: ${githubActions.getEventThatTriggeredThisRun()}. Bye bye...`,
    )
    return
  }

  log.notice(`👋 Hello! I am a tool called new-deployment-tool. I help you deploy your projects.`)
  log.message(
    `To learn how the deployment process of your project works, I suggest reading all of the logs that I print to you below.`,
  )
  log.message(
    `If you have more questions after reading the logs, you can optionally view the documentation to learn more about the tool: https://github.com/levibostian/new-deployment-tool/`,
  )
  log.message(`Ok, let's get started with the deployment!`)
  log.message(`--------------------------------`)

  let currentBranch = githubActions.getNameOfCurrentBranch()
  log.debug(`name of current git branch: ${currentBranch}`)

  // example value for GITHUB_REPOSITORY: "denoland/deno"
  const githubRepositoryFromEnvironment = Deno.env.get("GITHUB_REPOSITORY")!
  const [owner, repo] = githubRepositoryFromEnvironment.split("/")
  log.debug(
    `github repository executing in: ${githubRepositoryFromEnvironment}. owner: ${owner}, repo: ${repo}`,
  )

  const runInTestMode = (await githubActions.isRunningInPullRequest()) !== undefined
  let commitsCreatedDuringSimulatedMerges: GitHubCommit[] = []
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
      startingBranch: currentBranch,
    })

    const pullRequestBranchBeforeSimulatedMerges = currentBranch
    currentBranch = prepareEnvironmentForTestModeResults?.currentGitBranch || currentBranch
    commitsCreatedDuringSimulatedMerges = prepareEnvironmentForTestModeResults?.commitsCreatedDuringSimulatedMerges || []

    log.notice(
      `🧪 Simulated merges complete. You will notice that for the remainder of the deployment process, the current branch will be ${currentBranch} instead of the pull request branch ${pullRequestBranchBeforeSimulatedMerges}.`,
    )
  }

  githubActions.setOutput({ key: "test_mode_on", value: runInTestMode.toString() })

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

  // if we are running in test mode and ran simulated merges, add those created commits to list of commits to have analyzed.
  // add commits to beginning of list as newest commits should be first in list, like `git log`
  listOfCommits.unshift(...commitsCreatedDuringSimulatedMerges)

  if (listOfCommits.length === 0) {
    log.warning(
      `Looks like zero commits have been created since the latest release. This means there is no new code created and therefore, the deployment process stops here. Bye-bye 👋!`,
    )
    return
  }
  let newestCommit = listOfCommits[0]
  log.debug(`Newest commit found: ${JSON.stringify(newestCommit)}`)
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
  }

  const nextReleaseVersion = (await stepRunner.determineNextReleaseVersionStep(determineNextReleaseVersionEnvironment))?.version

  if (!nextReleaseVersion) {
    log.warning(
      `After analyzing all of the git commits, none of the commits need to be deployed. Therefore, the deployment process stops here with no new release to be made. Bye-bye 👋!`,
    )
    return
  }
  log.message(
    `After analyzing all of the git commits, I have determined the next release version will be: ${nextReleaseVersion}`,
  )

  log.notice(
    `🚢 It's time to ship ${nextReleaseVersion}! I will now run all of the deployment commands provided in your project's configuration file...`,
  )

  const deployEnvironment: DeployStepInput = { ...determineNextReleaseVersionEnvironment, nextVersionName: nextReleaseVersion }

  const gitCommitCreated = await deployStep.runDeploymentCommands({
    environment: deployEnvironment,
  })
  if (gitCommitCreated) {
    newestCommit = gitCommitCreated
  }

  // TODO - update this log to mention that we are now verifying the latest version got set.
  // log.notice(
  //`✏️ The code has been deployed. The final piece of the deployment process is creating a new release on GitHub for the new version, ${nextReleaseVersion}. Creating that now...${(runInTestMode
  //    ? "(Test mode is enabled so I will not create the new release)"
  //    : "")}`,
  //)

  log.notice(
    `🎉 Congratulations! The deployment process has completed. Bye-bye 👋!`,
  )

  githubActions.setOutput({ key: "new_release_version", value: nextReleaseVersion })
}
