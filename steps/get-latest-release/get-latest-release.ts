import { GitHubApiImpl } from "../../lib/github-api.ts"
import { GetLatestReleaseStepInput } from "../../lib/types/environment.ts"
import { GetLatestReleaseStepOutput } from "../../lib/steps/types/output.ts"
import { GitHubCommit, GitHubRelease } from "../../lib/github-api.ts"

const input: GetLatestReleaseStepInput & { sampleData?: { getCommitsForBranch: GitHubCommit[]; getTagsWithGitHubReleases: GitHubRelease[] } } = JSON
  .parse(await Deno.readTextFile(Deno.env.get("DATA_FILE_PATH")!))

const githubApi = GitHubApiImpl

let latestRelease: GetLatestReleaseStepOutput | null = null
let githubReleases: GitHubRelease[] = []

await githubApi.getTagsWithGitHubReleases({
  sampleData: input.sampleData?.getTagsWithGitHubReleases,
  owner: input.gitRepoOwner,
  repo: input.gitRepoName,
  processReleases: async (releases: GitHubRelease[]) => {
    githubReleases = githubReleases.concat(releases)
    return true // continue paging
  },
})

await githubApi.getCommitsForBranch({
  sampleData: input.sampleData?.getCommitsForBranch,
  owner: input.gitRepoOwner,
  repo: input.gitRepoName,
  branch: input.gitCurrentBranch,
  processCommits: async (commits: GitHubCommit[]) => {
    for (const githubRelease of githubReleases) {
      for (const commit of commits) {
        if (githubRelease.tag.commit.sha === commit.sha && !latestRelease) {
          latestRelease = {
            versionName: githubRelease.tag.name,
            commitSha: githubRelease.tag.commit.sha,
          }
        }
      }
    }
    const getNextPage = latestRelease === null
    return getNextPage
  },
})

// Write output as JSON to the same file, if a latest release was found.
// Otherwise leave it and the deployment tool will know that there is no release to deploy.
if (latestRelease !== null) {
  await Deno.writeTextFile(Deno.env.get("DATA_FILE_PATH")!, JSON.stringify(latestRelease))
}
