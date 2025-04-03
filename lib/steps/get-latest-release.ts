import { GitHubApi, GitHubRelease } from "../github-api.ts"

export interface GetLatestReleaseStep {
  getLatestReleaseForBranch({ owner, repo, branch }: {
    owner: string
    repo: string
    branch: string
  }): Promise<GitHubRelease | null>
}

export class GetLatestReleaseStepImpl implements GetLatestReleaseStep {
  constructor(private githubApi: GitHubApi) {}

  async getLatestReleaseForBranch({ owner, repo, branch }: {
    owner: string
    repo: string
    branch: string
  }): Promise<GitHubRelease | null> {
    // the goal of this function is to find the latest release for a given branch.
    // the github api does not provide an easy way to do this. you must get releases and commits separately and then compare them.
    //
    // both of these endpoints have paging and we also want to minimize the number of requests we make to github for rate limiting.
    //
    // the strategy here is a mix between performance and simplicity for maintenance of the code.
    // First, get all releases for the repo. Even if we don't need to view them all, get them all otherwise we may need to implement some complex caching strategy.
    // Next, page through commits for a branch and compare to all releases.
    // We are assuming there are less releases than commits, which is what makes this performant.

    let latestRelease: GitHubRelease | null = null

    let githubReleases: GitHubRelease[] = []

    await this.githubApi.getTagsWithGitHubReleases({
      owner,
      repo,
      processReleases: async (releases) => {
        githubReleases = githubReleases.concat(releases)
        return true // continue paging
      },
    })

    await this.githubApi.getCommitsForBranch({
      owner,
      repo,
      branch,
      processCommits: async (commits) => {
        for (const githubRelease of githubReleases) {
          for (const commit of commits) {
            if (githubRelease.tag.commit.sha === commit.sha && !latestRelease) {
              latestRelease = githubRelease
            }
          }
        }

        const getNextPage = latestRelease === null

        return getNextPage
      },
    })

    return latestRelease
  }
}
