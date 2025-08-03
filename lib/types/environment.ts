import { GetLatestReleaseStepOutput } from "../steps/types/output.ts"
import { GitCommit } from "./git.ts"

/*
  Each environment object contains information about the current state of the git repository and data that the tool has fetched/processed. Each step of the deployment may find this environment object useful to make decisions on what to do next.

  There are multiple different types of environment objects where each step of the process fetches/processes more data and adds it to the environment object.
*/

export interface GetLatestReleaseStepInput {
  gitCurrentBranch: string
  gitRepoOwner: string
  gitRepoName: string
  testMode: boolean
  gitCommitsCurrentBranch: GitCommit[]
  gitCommitsAllLocalBranches: { [branchName: string]: GitCommit[] }
}

export interface GetNextReleaseVersionStepInput extends GetLatestReleaseStepInput {
  lastRelease: GetLatestReleaseStepOutput | null
  gitCommitsSinceLastRelease: GitCommit[]
}

export interface DeployStepInput extends GetNextReleaseVersionStepInput {
  nextVersionName: string
}

export type AnyStepInput = GetLatestReleaseStepInput | GetNextReleaseVersionStepInput | DeployStepInput
