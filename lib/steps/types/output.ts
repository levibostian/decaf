export interface GetLatestReleaseStepOutput {
  versionName: string
  commitSha: string
}

export const isGetLatestReleaseStepOutput = (
  obj: unknown,
): obj is GetLatestReleaseStepOutput => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "versionName" in obj &&
    typeof (obj as Record<string, unknown>).versionName === "string" &&
    "commitSha" in obj &&
    typeof (obj as Record<string, unknown>).commitSha === "string"
  )
}

export interface GetNextReleaseVersionStepOutput {
  version: string
}

export const isGetNextReleaseVersionStepOutput = (
  obj: unknown,
): obj is GetNextReleaseVersionStepOutput => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "version" in obj &&
    typeof (obj as Record<string, unknown>).version === "string"
  )
}
