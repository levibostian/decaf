import { GetLatestReleaseStepOutput, GetNextReleaseVersionStepOutput } from "../steps/types/output.ts"
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
  // If a script ran before the current script, you receive the output from previous scripts here.
  previousScriptsOutput?: GetLatestReleaseStepOutput
}

// extends input data type from previous step, but omit the previousScriptsOutput property since that's data that is only used for that step.
export interface GetNextReleaseVersionStepInput extends Omit<GetLatestReleaseStepInput, "previousScriptsOutput"> {
  lastRelease: GetLatestReleaseStepOutput | null
  gitCommitsSinceLastRelease: GitCommit[]
  // If a script ran before the current script, you receive the output from previous scripts here.
  previousScriptsOutput?: GetNextReleaseVersionStepOutput
}

// extends input data type from previous step, but omit the previousScriptsOutput property since that's data that is only used for that step.
export interface DeployStepInput extends Omit<GetNextReleaseVersionStepInput, "previousScriptsOutput"> {
  nextVersionName: string
  // If a script ran before the current script, you receive the output from previous scripts here.
  previousScriptsOutput?: Record<string, unknown>
}

export type AnyStepInput = GetLatestReleaseStepInput | GetNextReleaseVersionStepInput | DeployStepInput
