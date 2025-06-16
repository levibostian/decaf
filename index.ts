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

/*
This file is the entrypoint for running the tool.
This file has no automated tests written for it. Keep the size of this file small with no logic.
*/

const githubApi = GitHubApiImpl
const githubActions = new GitHubActionsImpl()

await run({
  stepRunner: new StepRunnerImpl(githubActions, exec, logger),
  prepareEnvironmentForTestMode: new PrepareTestModeEnvStepImpl(githubApi, githubActions, new SimulateMergeImpl(git, exec), git, exec),
  getCommitsSinceLatestReleaseStep: new GetCommitsSinceLatestReleaseStepImpl(
    githubApi,
  ),
  deployStep: new DeployStepImpl(exec),
  log: logger,
  githubActions: githubActions,
})
