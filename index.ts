import { run } from "./deploy.ts"
import { GitHubApiImpl } from "./lib/github-api.ts"
import { DeployStepImpl } from "./lib/steps/deploy.ts"
import { GetCommitsSinceLatestReleaseStepImpl } from "./lib/steps/get-commits-since-latest-release.ts"
import { exec } from "./lib/exec.ts"
import { git } from "./lib/git.ts"
import { logger } from "./lib/log.ts"
import { GitHubActionsImpl } from "./lib/github-actions.ts"
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
  ],
  default: {
    github_token: "",
    git_config: "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
    deploy: "",
    get_latest_release_current_branch: "",
    get_next_release_version: "",
    simulated_merge_type: "merge",
    output_file: "",
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
const githubActions = new GitHubActionsImpl()

await run({
  convenienceStep: new ConvenienceStepImpl(exec, githubActions, logger),
  stepRunner: new StepRunnerImpl(githubActions, exec, logger),
  prepareEnvironmentForTestMode: new PrepareTestModeEnvStepImpl(githubApi, githubActions, new SimulateMergeImpl(git, exec), git, exec),
  getCommitsSinceLatestReleaseStep: new GetCommitsSinceLatestReleaseStepImpl(githubApi),
  deployStep: new DeployStepImpl(exec),
  log: logger,
  githubActions: githubActions,
})
