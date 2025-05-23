// Purposely making properties optional for convenience.
export interface DeployCommandOutput {
  filesToCommit?: string[]
}

// deno-lint-ignore no-explicit-any
export const isDeployCommandOutput = (obj: any): obj is DeployCommandOutput => {
  return (
    obj &&
    (obj.filesToCommit === undefined ||
      (Array.isArray(obj.filesToCommit) &&
        // deno-lint-ignore no-explicit-any
        obj.filesToCommit.every((item: any) => typeof item === "string")))
  )
}

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
