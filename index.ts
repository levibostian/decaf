import { run } from "./deploy.ts"
import { GitHubApiImpl } from "./lib/github-api.ts"
import { CreateNewReleaseStepImpl } from "./lib/steps/create-new-release.ts"
import { DeployStepImpl } from "./lib/steps/deploy.ts"
import { DetermineNextReleaseStepImpl } from "./lib/steps/determine-next-release.ts"
import { GetCommitsSinceLatestReleaseStepImpl } from "./lib/steps/get-commits-since-latest-release.ts"
import { GetLatestReleaseStepImpl } from "./lib/steps/get-latest-release.ts"
import { exec } from "./lib/exec.ts"
import { git } from "./lib/git.ts"
import { logger } from "./lib/log.ts"
import { GitHubActionsImpl } from "./lib/github-actions.ts"
import { SimulateMergeImpl } from "./lib/simulate-merge.ts"
import { PrepareTestModeEnvStepImpl } from "./lib/steps/prepare-testmode-env.ts"

/*
This file is the entrypoint for running the tool.
This file has no automated tests written for it. Keep the size of this file small with no logic.
*/

const githubApi = GitHubApiImpl
const githubActions = new GitHubActionsImpl()

await run({
  prepareEnvironmentForTestMode: new PrepareTestModeEnvStepImpl(githubApi, githubActions, new SimulateMergeImpl(git, exec), git, exec),
  getLatestReleaseStep: new GetLatestReleaseStepImpl(githubApi),
  getCommitsSinceLatestReleaseStep: new GetCommitsSinceLatestReleaseStepImpl(
    githubApi,
  ),
  determineNextReleaseStep: new DetermineNextReleaseStepImpl(),
  deployStep: new DeployStepImpl(exec, git),
  createNewReleaseStep: new CreateNewReleaseStepImpl(githubApi),
  log: logger,
  githubActions: githubActions,
})
