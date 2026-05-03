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

Want to know the deployment process of this codebase? Continue reading where each step is explained to you. 
Want to learn more about me? Visit the docs --> https://github.com/levibostian/decaf/`)

  // --- Simulate pull request merges, if running in pull request

  let currentBranch = environment.getBuild().currentBranch
  log.debug(`name of current git branch: ${currentBranch}`)
  const { owner, repo } = environment.getRepository()

  const pullRequestInfo = environment.isRunningInPullRequest()
  const runInTestMode = pullRequestInfo !== undefined
  if (runInTestMode && pullRequestInfo) {
    log.phase(`Perform setup before running deployment`)

    log.msg(`Before we can start the deployment process, I need to perform some setup steps to prepare for the deployment.`)

    log.step(`Simulate merging pull requests...`)

    log.msg(
      `I see that I got triggered from a pull request event. This means that I will run the full deployment process but I will not actually push a release. This allows you to safely test your full deployment process.`,
    )

    log.msg(
      `To make the test most accurate. I'm going to simulate what would happen if this pull request and all of its parent pull requests are merged. Don't worry, this will not actually merge any pull requests!`,
    )

    log.msg(`Simulating pull request merges...`)

    const prepareEnvironmentForTestModeResults = await prepareEnvironmentForTestMode.prepareEnvironmentForTestMode({
      owner,
      repo,
      simulatedMergeType,
    })

    currentBranch = prepareEnvironmentForTestModeResults?.currentGitBranch || currentBranch

    for (const pr of prepareEnvironmentForTestModeResults?.pullRequestsMerged ?? []) {
      log.msg(`\`${pr.sourceBranchName}\` (#${pr.pullRequestNumber}) --> \`${pr.targetBranchName}\`... using '${pr.mergeType}'.`)
    }

    log.done(
      `Merging complete. The deployment will run on the \`${currentBranch}\` branch, as if all of the pull requests were merged.`,
    )
  }

  await environment.setOutput({ key: "test_mode_on", value: runInTestMode.toString() })

  if (!runInTestMode) {
    log.phase(`Perform setup before running deployment`)
    log.msg(`Before we can start the deployment process, I need to perform some setup steps to prepare for the deployment.`)
  }

  log.step(`Setting up git user config...`)

  const { gitConfigName, gitConfigEmail } = await convenienceStep.setGitUserConfig()

  log.kv(
    `For convenience, I set the git committer name and email, just in case you wanted to make any commits in your deployment commands`,
    [
      ["name", gitConfigName],
      ["email", gitConfigEmail],
    ],
  )

  log.msg(`If you would rather use a different name and email, you can change it with the \`git_config\` option.`)

  log.step(`Parsing git commits...`)

  log.msg(
    `To make writing scripts more convenient, I run \`git log\` and parse all of the git commits into a format that is much easier to work with. All of them are passed as input data into each of the scripts. \n\nDocs for the format of the parsed git commits: https://github.com/levibostian/decaf/blob/main/lib/types/git.ts`,
  )

  const branchFilters = environment.getBranchFilters()
  const commitLimit = environment.getCommitLimit()

  log.msg(`Parsing commits for the following git branches: ${branchFilters?.join(", ") ?? currentBranch}...`)

  const { gitCommitsAllLocalBranches, gitCommitsCurrentBranch } = await convenienceStep.parseGitCommits(
    branchFilters,
    commitLimit,
  )

  log.done(
    `${
      Object.values(gitCommitsAllLocalBranches).reduce((sum, commits) => sum + commits.length, 0)
    } commits parsed. If that took too long to run, you can optimize it with the \`branch_filters\` and \`commit_limit\` options.`,
  )

  // --- Find latest release and commits since then

  log.phase(`Find latest release & git commits made since then`)

  log.step(`Finding the latest release...`)

  log.msg(
    `I need to know the latest release that has been made so I can determine what has changed since then. To do that, I will run the script that you have provided for getting the latest release...`,
  )

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
    log.done(`The script told me that the git branch, ${currentBranch}, has never been released before. This will be the first release. Exciting!`)
  } else {
    log.done(
      `The script told me that the latest release is version: ${lastRelease.versionName}, which was shipped from git commit: ${
        lastRelease.commitSha?.substring(0, 10)
      }`,
    )
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

  log.step(`Analyze git commits to determine the next release version...`)

  log.msg(
    `I need to know if any of the ${listOfCommits.length} commits created since the latest release (1) is important enough to trigger a new release and (2) if any are, what will be the next release's version name? To do that, I will run the script that you have provided for getting the next release version...`,
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

  const determineNextReleaseResult = await stepRunner.determineNextReleaseVersionStep(determineNextReleaseVersionEnvironment)
  if (determineNextReleaseResult?.command) log.cmd(determineNextReleaseResult.command)
  const nextReleaseVersion = determineNextReleaseResult?.output?.version

  if (!nextReleaseVersion) {
    log.done(
      `After analyzing all of the git commits, none of the commits need to be deployed. Therefore, the deployment process stops here with no new release to be made. Bye-bye!`,
    )
    return { nextReleaseVersion: null, commitsSinceLastRelease: listOfCommits, latestRelease: lastRelease }
  }
  log.done(`The script told me that the next release version will be: ${nextReleaseVersion}`)

  // --- Run deployment commands

  log.phase(`Deploying new release ${nextReleaseVersion}`)

  log.step(`Running all of your deployment commands...`)

  log.msg(`It's time to ship ${nextReleaseVersion}! To do that, I will run all of the scripts that you have provided for deploying the project...`)

  const deployEnvironment: DeployStepInput = { ...determineNextReleaseVersionEnvironment, nextVersionName: nextReleaseVersion }

  const deployResult = await stepRunner.runDeployStep(deployEnvironment)
  for (const command of deployResult?.commands ?? []) {
    log.cmd(command)
  }

  log.done(`Finished running all of the deployment commands.`)

  log.step(`Verifying deployment...`)

  // Re-run get-latest-release step to verify the new release
  log.msg(
    `Deployments fail sometimes. To help you feel confident that your deployment was successful, I perform a verification step. To run the verification, I run the script you provided to me to get the latest release again. If the script doesn't produce the expected result, the verification fails, which could indicate a problem with the deployment process.`,
  )
  // Re-run convenience commands to ensure any git changes done in deployment commands are included. This will
  // run a git fetch again and parse commits all over again.
  await git.fetch()

  const {
    gitCommitsAllLocalBranches: gitCommitsAllLocalBranchesAfterDeploy,
    gitCommitsCurrentBranch: gitCommitsCurrentBranchAfterDeploy,
  } = await convenienceStep.parseGitCommits(
    branchFilters,
    commitLimit,
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

  log.kv(`Summary of deployment`, [
    ["New release version", nextReleaseVersion],
    ["Latest release before deployment", lastRelease ? lastRelease.versionName : "This is the first release!"],
    ["Branch deployed", currentBranch],
    ["Number of commits deployed", listOfCommits.length.toString()],
    ["Latest git commit deployed", `${listOfCommits[0].title} (${listOfCommits[0].abbreviatedSha})`],
    ["Oldest git commit deployed", `${listOfCommits[listOfCommits.length - 1].title} (${listOfCommits[listOfCommits.length - 1].abbreviatedSha})`],
  ])

  log.msg(`The deployment process has completed. Bye-bye!`)

  await environment.setOutput({ key: "new_release_version", value: nextReleaseVersion })

  // In test mode, also set the merge-type-specific output
  if (runInTestMode) {
    await environment.setOutput({ key: `new_release_version_simulated_${simulatedMergeType}`, value: nextReleaseVersion })
  }

  return { nextReleaseVersion, commitsSinceLastRelease: listOfCommits, latestRelease: lastRelease }
}
