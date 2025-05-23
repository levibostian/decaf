import { GitHubCommit } from "../github-api.ts"
import { GetLatestReleaseStepOutput } from "../steps/types/output.ts"

/*
  Each environment object contains information about the current state of the git repository and data that the tool has fetched/processed. Each step of the deployment may find this environment object useful to make decisions on what to do next.

  There are multiple different types of environment objects where each step of the process fetches/processes more data and adds it to the environment object.
*/

export interface GetLatestReleaseStepInput {
  gitCurrentBranch: string
  gitRepoOwner: string
  gitRepoName: string
  testMode: boolean
}

export interface GetNextReleaseVersionStepInput extends GetLatestReleaseStepInput {
  lastRelease: GetLatestReleaseStepOutput | null
  gitCommitsSinceLastRelease: GitHubCommit[]
}

export interface DeployStepInput extends GetNextReleaseVersionStepInput {
  nextVersionName: string
}

export type AnyStepInput = GetLatestReleaseStepInput | GetNextReleaseVersionStepInput | DeployStepInput
