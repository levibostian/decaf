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
