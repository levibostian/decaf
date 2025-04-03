import { GitHubApi, GitHubCommit } from "../github-api.ts"

export interface CreateNewReleaseStep {
  createNewRelease({ owner, repo, tagName, commit }: {
    owner: string
    repo: string
    tagName: string
    commit: GitHubCommit
  }): Promise<void>
}

export class CreateNewReleaseStepImpl implements CreateNewReleaseStep {
  constructor(private githubApi: GitHubApi) {}

  async createNewRelease({ owner, repo, tagName, commit }: {
    owner: string
    repo: string
    tagName: string
    commit: GitHubCommit
  }): Promise<void> {
    await this.githubApi.createGitHubRelease({
      owner,
      repo,
      tagName,
      commit,
    })
  }
}
