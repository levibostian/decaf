import { Logger } from "./lib/log.ts"
import { GetCommitsSinceLatestReleaseStep } from "./lib/steps/get-commits-since-latest-release.ts"
import { DeployStepInput, GetNextReleaseVersionStepInput } from "./lib/types/environment.ts"
import { Environment } from "./lib/environment.ts"
import { PrepareTestModeEnvStep } from "./lib/steps/prepare-testmode-env.ts"
import { GitHubCommit } from "./lib/github-api.ts"
import { StepRunner } from "./lib/step-runner.ts"
import { ConvenienceStep } from "./lib/steps/convenience.ts"
import { GetLatestReleaseStepOutput } from "./lib/steps/types/output.ts"
import { Git } from "./lib/git.ts"

export const run = async ({
  convenienceStep,
  stepRunner,
  prepareEnvironmentForTestMode,
  getCommitsSinceLatestReleaseStep,
  environment,
  git,
  log,
  simulatedMergeType,
}: {
  convenienceStep: ConvenienceStep
  stepRunner: StepRunner
  prepareEnvironmentForTestMode: PrepareTestModeEnvStep
  getCommitsSinceLatestReleaseStep: GetCommitsSinceLatestReleaseStep
  environment: Environment
  git: Git
  log: Logger
  simulatedMergeType: "merge" | "rebase" | "squash"
}): Promise<
  { nextReleaseVersion: string | null; commitsSinceLastRelease: GitHubCommit[]; latestRelease: GetLatestReleaseStepOutput | null } | null
> => {
  if (environment.getEventThatTriggeredThisRun() !== "push" && environment.getEventThatTriggeredThisRun() !== "pull_request") {
    log.error(
      [`Sorry, you can only trigger this tool from a push or a pull_request. The event that triggered this run was: ${environment.getEventThatTriggeredThisRun()}. Bye bye...`],
    )
    return null
  }

  // --- Intro section

  log.raw(String.raw`
                                           __                             ___
                                          /\ \                          /'___\
                                          \_\ \     __    ___     __   /\ \__/
                                          /'_' \  /'__'\ /'___\ /'__'\ \ \ ,__\
                                         /\ \L\ \/\  __//\ \__//\ \L\.\_\ \ \_/
                                         \ \___,_\ \____\ \____\ \__/.\_\\ \_\\
                                          \/__,_ /\/____/\/____/\/__/\/_/ \/_/
  `)

  log.title(`Calm & reliable automated deployments. No more coffee breaks.`)

  log.msg(`Hello! I am a tool called decaf. I help you deploy your projects.
To learn how the deployment process of your project works, I suggest reading all of the logs that I print to you below.

To learn more about the tool: https://github.com/levibostian/decaf/`)

  // --- Simulate pull request merges, if running in pull request

  let currentBranch = environment.getBuild().currentBranch
  log.debug(`name of current git branch: ${currentBranch}`)
  const { owner, repo } = environment.getRepository()

  const pullRequestInfo = environment.isRunningInPullRequest()
  const runInTestMode = pullRequestInfo !== undefined
  if (runInTestMode && pullRequestInfo) {
    log.phase(`Prepare environment for pull request event`)

    log.msg(
      `I see that I got triggered from a pull request event. This means that I will still run the full deployment process but I will not actually make a release. This allows you to safely test the deployment process without affecting the actual release.`,
    )

    log.step(`Simulate merging pull requests...`)

    log.msg(
      `In order to accurately test the deployment process, I will simulate what would happen if this pull request and all of it's parent pull requests get merged. To simulate the merge, I will simply perform a series of git merges in the temporary environment where I am running. Don't worry, this will not affect your actual pull request or git history!`,
    )

    const prepareEnvironmentForTestModeResults = await prepareEnvironmentForTestMode.prepareEnvironmentForTestMode({
      owner,
      repo,
      simulatedMergeType,
    })

    const pullRequestBranchBeforeSimulatedMerges = currentBranch
    currentBranch = prepareEnvironmentForTestModeResults?.currentGitBranch || currentBranch

    log.list(
      `Pull requests merged during simulation:`,
      prepareEnvironmentForTestModeResults?.pullRequestsMerged.map((pr) => `${pr.pullRequestTitle} - #${pr.pullRequestNumber}`) || [],
    )

    log.done(
      `Simulated merges complete. For the remainder of the deployment process, the current branch will be ${currentBranch} instead of the pull request branch ${pullRequestBranchBeforeSimulatedMerges}.`,
    )
  }

  await environment.setOutput({ key: "test_mode_on", value: runInTestMode.toString() })

  // --- Setup & environment

  log.phase(`Setup & environment`)

  log.step(`Printing environment info...`)

  const { failOnDeployVerification, makePullRequestComment } = environment.getUserConfigurationOptions()
  log.kv(`Environment info`, [
    ["GitHub repository", `${owner}/${repo}`],
    ["Current git branch", currentBranch],
    ["Running in test mode?", runInTestMode.toString()],
    ["Fail on deploy verification", failOnDeployVerification.toString()],
    ["Make pull request comment", makePullRequestComment.toString()],
  ])

  log.step(`Setting up git user config...`)

  const { gitConfigName, gitConfigEmail } = await convenienceStep.setGitUserConfig()

  log.kv(
    `For convenience, I set the git committer name and email, just in case you wanted to make any commits in your deployment commands`,
    [
      ["name", gitConfigName],
      ["email", gitConfigEmail],
    ],
  )

  log.step(`Parsing git commits...`)

  const { gitCommitsAllLocalBranches, gitCommitsCurrentBranch } = await convenienceStep.parseGitCommits(
    environment.getBranchFilters(),
    environment.getCommitLimit(),
  )

  log.done(
    `Finished parsing git commits. I found ${gitCommitsCurrentBranch.length} commits on the current branch, ${currentBranch}, and ${
      Object.values(gitCommitsAllLocalBranches).reduce((sum, commits) => sum + commits.length, 0)
    } commits across all local branches that match the branch filters.`,
  )

  // --- Find latest release and commits since then

  log.phase(`Find latest release & git commits made since then`)

  log.step(`Finding the latest release on the current git branch, ${currentBranch}...`)

  const latestReleaseResult = await stepRunner.runGetLatestOnCurrentBranchReleaseStep({
    gitCurrentBranch: currentBranch,
    gitRepoOwner: owner,
    gitRepoName: repo,
    testMode: runInTestMode,
    gitCommitsCurrentBranch,
    gitCommitsAllLocalBranches,
  })
  if (latestReleaseResult?.command) log.cmd(latestReleaseResult.command)
  const lastRelease = latestReleaseResult?.output ?? null

  log.debug(`Latest release on branch ${currentBranch} is: ${JSON.stringify(lastRelease)}`)

  if (!lastRelease) {
    log.done(`I have been told that the git branch, ${currentBranch}, has never been released before. This will be the first release. Exciting!`)
  } else {
    log.done(`I have been told that the latest release on the git branch ${currentBranch} is: ${lastRelease.versionName}`)
  }

  log.step(`Finding all git commits created since the latest release...`)

  const listOfCommits = await getCommitsSinceLatestReleaseStep
    .getAllCommitsSinceGivenCommit({
      owner,
      repo,
      branch: currentBranch,
      latestRelease: lastRelease,
    })

  if (listOfCommits.length === 0) {
    log.done(
      `Looks like zero commits have been created since the latest release. This means there is no new code created and therefore, the deployment process stops here. Bye-bye!`,
    )
    return { nextReleaseVersion: null, commitsSinceLastRelease: listOfCommits, latestRelease: lastRelease }
  }
  log.debug(`Newest commit found: ${JSON.stringify(listOfCommits[0])}`)
  log.debug(
    `Oldest commit found: ${JSON.stringify(listOfCommits[listOfCommits.length - 1])}`,
  )

  log.done(
    `I found ${listOfCommits.length} git commits created since ${
      lastRelease ? `the latest release of ${lastRelease.versionName}` : `the git branch ${currentBranch} was created`
    }.`,
  )

  log.list(`Here are the commits I found since the latest release`, listOfCommits.map((commit) => `${commit.title} (${commit.abbreviatedSha})`))

  // --- Determine next release version

  log.phase(`Analyze git commits`)

  log.step(`Analyzing the git commits one-by-one to determine the next release version...`)

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

  const determineNextReleaseResult = await stepRunner.determineNextReleaseVersionStep(determineNextReleaseVersionEnvironment)
  if (determineNextReleaseResult?.command) log.cmd(determineNextReleaseResult.command)
  const nextReleaseVersion = determineNextReleaseResult?.output?.version

  if (!nextReleaseVersion) {
    log.done(
      `After analyzing all of the git commits, none of the commits need to be deployed. Therefore, the deployment process stops here with no new release to be made. Bye-bye!`,
    )
    return { nextReleaseVersion: null, commitsSinceLastRelease: listOfCommits, latestRelease: lastRelease }
  }
  log.done(`After analyzing all of the git commits, I have determined the next release version will be: ${nextReleaseVersion}`)

  // --- Run deployment commands

  log.phase(`Deploying new release ${nextReleaseVersion}`)

  log.step(`Running all of your deployment commands...`)

  log.msg(`It's time to ship ${nextReleaseVersion}! I will now run all of the deployment commands provided in your project's configuration...`)

  const deployEnvironment: DeployStepInput = { ...determineNextReleaseVersionEnvironment, nextVersionName: nextReleaseVersion }

  const deployResult = await stepRunner.runDeployStep(deployEnvironment)
  for (const command of deployResult?.commands ?? []) {
    log.cmd(command)
  }

  log.done(`Finished running deployment commands. The deployment should now be complete!`)

  log.step(`Verifying deployment...`)

  // Re-run get-latest-release step to verify the new release
  log.msg(
    `Getting the latest release version again to verify that the new release, ${nextReleaseVersion}, was successfully created. If the latest version does not match, the verification fails, it could indicate a problem with the deployment process.`,
  )
  // Re-run convenience commands to ensure any git changes done in deployment commands are included. This will
  // run a git fetch again and parse commits all over again.
  await git.fetch()

  const {
    gitCommitsAllLocalBranches: gitCommitsAllLocalBranchesAfterDeploy,
    gitCommitsCurrentBranch: gitCommitsCurrentBranchAfterDeploy,
  } = await convenienceStep.parseGitCommits(
    environment.getBranchFilters(),
    environment.getCommitLimit(),
  )

  const latestReleaseAfterDeployResult = await stepRunner.runGetLatestOnCurrentBranchReleaseStep({
    gitCurrentBranch: currentBranch,
    gitRepoOwner: owner,
    gitRepoName: repo,
    testMode: runInTestMode,
    gitCommitsCurrentBranch: gitCommitsCurrentBranchAfterDeploy,
    gitCommitsAllLocalBranches: gitCommitsAllLocalBranchesAfterDeploy,
  })
  if (latestReleaseAfterDeployResult?.command) log.cmd(latestReleaseAfterDeployResult.command)
  const latestReleaseAfterDeploy = latestReleaseAfterDeployResult?.output ?? null
  log.debug(`Latest release after deploy: ${JSON.stringify(latestReleaseAfterDeploy)}`)

  if (latestReleaseAfterDeploy?.versionName === nextReleaseVersion) {
    log.done(
      `Verification successful! The latest release is now ${latestReleaseAfterDeploy.versionName}, which matches the version that was just deployed.`,
    )
  } else {
    if (runInTestMode) {
      log.warn(
        `Verification failed, but that could be expected in test mode. The latest release after deployment is ${
          latestReleaseAfterDeploy?.versionName ?? "<none>"
        }, but expected ${nextReleaseVersion}. This could indicate a problem with the deployment process.`,
      )
    } else {
      log.error([
        `Verification failed! The latest release after deployment is ${
          latestReleaseAfterDeploy?.versionName ?? "<none>"
        }, but expected ${nextReleaseVersion}. This could indicate a problem with the deployment process.`,
      ])

      if (environment.getUserConfigurationOptions().failOnDeployVerification) {
        throw new Error(
          `Deployment verification failed: latest release is ${latestReleaseAfterDeploy?.versionName ?? "<none>"}, expected ${nextReleaseVersion}`,
        )
      }
    }
  }

  // --- Outro section/summary

  log.phase(`All done!`)

  log.msg(
    `Congratulations! The deployment process has completed. Bye-bye!`,
  )

  log.kv(`Summary of deployment`, [
    ["New release version", nextReleaseVersion],
    ["Latest release before deployment", lastRelease ? lastRelease.versionName : "This is the first release!"],
    ["Branch deployed", currentBranch],
    ["Number of commits deployed", listOfCommits.length.toString()],
    ["Latest git commit deployed", `${listOfCommits[0].title} (${listOfCommits[0].abbreviatedSha})`],
    ["Oldest git commit deployed", `${listOfCommits[listOfCommits.length - 1].title} (${listOfCommits[listOfCommits.length - 1].abbreviatedSha})`],
  ])

  await environment.setOutput({ key: "new_release_version", value: nextReleaseVersion })

  // In test mode, also set the merge-type-specific output
  if (runInTestMode) {
    await environment.setOutput({ key: `new_release_version_simulated_${simulatedMergeType}`, value: nextReleaseVersion })
  }

  return { nextReleaseVersion, commitsSinceLastRelease: listOfCommits, latestRelease: lastRelease }
}
