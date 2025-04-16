import { GitHubCommit, GitHubRelease } from "../github-api.ts"
import { Git } from "../git.ts"
import { Exec } from "../exec.ts"

export interface GetCommitsSinceLatestReleaseStep {
  getAllCommitsSinceGivenCommit({ latestRelease }: {
    latestRelease: GitHubRelease | null
  }): Promise<GitHubCommit[]>
}

export class GetCommitsSinceLatestReleaseStepImpl implements GetCommitsSinceLatestReleaseStep {
  constructor(private git: Git, private exec: Exec) {}

  async getAllCommitsSinceGivenCommit({ latestRelease }: {
    latestRelease: GitHubRelease | null
  }): Promise<GitHubCommit[]> {
    let returnResult: GitHubCommit[] = []

    const commits = await this.git.getLatestCommitsSince({
      exec: this.exec,
      commit: latestRelease
        ? {
          sha: latestRelease.tag.commit.sha,
          message: latestRelease.tag.name,
          date: latestRelease.created_at,
        }
        : null,
    })

    for (const commit of commits) {
      // We do not want to include the last tag commit in the list of commits. This may result in making a release from this commit which we do not want.
      if (commit.sha === latestRelease?.tag.commit.sha) {
        break // stop paging when we reach the last tag commit
      }

      returnResult.push(commit)
    }

    // sort commits by date. first commit is the newest one
    returnResult.sort((a, b) => b.date.getTime() - a.date.getTime())

    return returnResult
  }
}
