import { GitHubApi, GitHubCommit } from "../github-api.ts"
import { GetLatestReleaseStepOutput } from "./types/output.ts"

export interface GetCommitsSinceLatestReleaseStep {
  getAllCommitsSinceGivenCommit({ owner, repo, branch, latestRelease }: {
    owner: string
    repo: string
    branch: string
    latestRelease: GetLatestReleaseStepOutput | null
  }): Promise<GitHubCommit[]>
}

export class GetCommitsSinceLatestReleaseStepImpl implements GetCommitsSinceLatestReleaseStep {
  constructor(private githubApi: GitHubApi) {}

  async getAllCommitsSinceGivenCommit({ owner, repo, branch, latestRelease }: {
    owner: string
    repo: string
    branch: string
    latestRelease: GetLatestReleaseStepOutput | null
  }): Promise<GitHubCommit[]> {
    let returnResult: GitHubCommit[] = []

    await this.githubApi.getCommitsForBranch({
      owner,
      repo,
      branch,
      processCommits: async (commits) => {
        for (const commit of commits) {
          // We do not want to include the last tag commit in the list of commits. This may result in making a release from this commit which we do not want.
          if (commit.sha === latestRelease?.commitSha) {
            return false // stop paging when we reach the last tag commit
          }

          returnResult.push(commit)
        }

        return true // continue paging
      },
    })

    // sort commits by date. first commit is the newest one
    returnResult.sort((a, b) => b.date.getTime() - a.date.getTime())

    return returnResult
  }
}
