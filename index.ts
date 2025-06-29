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
import { parseArgs } from "@std/cli/parse-args"

const args = parseArgs(Deno.args, {
  string: [
    "github_token",
    "git_config",
    "deploy",
    "get_latest_release_current_branch",
    "get_next_release_version",
    "simulated_merge_type",
    "output_file",
    "make_pull_request_comment",
  ],
  default: {
    github_token: "",
    git_config: "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
    deploy: "",
    get_latest_release_current_branch: "",
    get_next_release_version: "",
    simulated_merge_type: "merge",
    output_file: "",
    make_pull_request_comment: "true",
  },
})

// Inject CLI args into environment variables for downstream code
Deno.env.set("INPUT_GITHUB_TOKEN", args.github_token)
Deno.env.set("INPUT_GIT_CONFIG", args.git_config)
Deno.env.set("INPUT_DEPLOY", args.deploy)
Deno.env.set("INPUT_GET_LATEST_RELEASE_CURRENT_BRANCH", args.get_latest_release_current_branch)
Deno.env.set("INPUT_GET_NEXT_RELEASE_VERSION", args.get_next_release_version)
Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", args.simulated_merge_type)
Deno.env.set("INPUT_OUTPUT_FILE", args.output_file)

const githubApi = GitHubApiImpl
const environment = new EnvironmentImpl()
const pullRequestInfo = environment.isRunningInPullRequest()
const buildInfo = environment.getBuild()
const simulatedMergeType = environment.getSimulatedMergeType()
const shouldPostStatusUpdatesOnPullRequest = args.make_pull_request_comment === "true" && pullRequestInfo !== undefined
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
