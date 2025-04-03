import { GitHubCommit } from "./github-api.ts"

export const versionBumpForCommitBasedOnConventionalCommit = (
  commit: GitHubCommit,
): "patch" | "major" | "minor" | undefined => {
  const message = commit.message

  if (/.*!:.*/.test(message)) {
    return "major"
  } else if (message.startsWith("feat:")) {
    return "minor"
  } else if (message.startsWith("fix:")) {
    return "patch"
  }

  return undefined
}
