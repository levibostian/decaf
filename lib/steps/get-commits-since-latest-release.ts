import { Exec } from "../exec.ts"
import { Git } from "../git.ts"
import { GitCommit } from "../types/git.ts"
import { GetLatestReleaseStepOutput } from "./types/output.ts"

export interface GetCommitsSinceLatestReleaseStep {
  getAllCommitsSinceGivenCommit({ owner, repo, branch, latestRelease }: {
    owner: string
    repo: string
    branch: string
    latestRelease: GetLatestReleaseStepOutput | null
  }): Promise<GitCommit[]>
}

export class GetCommitsSinceLatestReleaseStepImpl implements GetCommitsSinceLatestReleaseStep {
  constructor(private git: Git, private exec: Exec) {}

  async getAllCommitsSinceGivenCommit({ owner: _owner, repo: _repo, branch, latestRelease }: {
    owner: string
    repo: string
    branch: string
    latestRelease: GetLatestReleaseStepOutput | null
  }): Promise<GitCommit[]> {
    const returnResult: GitCommit[] = []

    const commits = await this.git.getCommits({
      exec: this.exec,
      branch: { ref: branch },
    })

    for (const commit of commits) {
      // We do not want to include the last tag commit in the list of commits. This may result in making a release from this commit which we do not want.
      if (commit.sha === latestRelease?.commitSha) {
        break
      }

      returnResult.push(commit)
    }

    // sort commits by date. first commit is the newest one
    returnResult.sort((a, b) => b.date.getTime() - a.date.getTime())

    return returnResult
  }
}
