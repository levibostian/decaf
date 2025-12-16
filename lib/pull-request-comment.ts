import { GitHubCommit } from "./github-api.ts"
import { GetLatestReleaseStepOutput } from "./steps/types/output.ts"
import * as di from "./di.ts"
import { renderStringTemplate } from "./utils.ts"

export const postPullRequestComment = async (args: {
  templateData: PullRequestCommentTemplateData
  templateString: string
  owner: string
  repo: string
  prNumber: number
  ciBuildId: string
  ciService: string
}): Promise<void> => {
  const { templateData, templateString, owner, repo, prNumber, ciBuildId, ciService } = args

  const diGraph = di.getGraph()
  const githubApi = diGraph.get("github")

  const renderedComment = await renderStringTemplate(templateString, templateData as unknown as Record<string, unknown>)

  await githubApi.postStatusUpdateOnPullRequest({
    message: renderedComment,
    owner,
    repo,
    prNumber,
    ciBuildId,
    ciService,
  })
}

/**
 * Data structure passed to the pull request comment template for rendering.
 * This data is available to the template to construct the PR comment.
 */
export interface PullRequestCommentTemplateData {
  /** The simulated merge types being tested */
  simulatedMergeTypes: ("merge" | "rebase" | "squash")[]
  /** Results from each simulated merge that has completed */
  results: SimulatedMergeResult[]
  /** Information about the CI build */
  build: {
    buildUrl?: string
    buildId: string
    ciService: string
  }
  /** Information about the pull request */
  pullRequest: {
    prNumber: number
    baseBranch: string
    targetBranch: string
  }
  /** Repository information */
  repository: {
    owner: string
    repo: string
  }
}

/**
 * Result from a single simulated merge run
 */
export interface SimulatedMergeResult {
  /** The merge type that was simulated */
  mergeType: "merge" | "rebase" | "squash"
  /** Whether the merge succeeded or failed */
  status: "success" | "error"
  /** The next release version, if any */
  nextReleaseVersion?: string | null
  /** The latest release on the branch */
  latestRelease?: GetLatestReleaseStepOutput | null
  /** Commits since the last release */
  commitsSinceLastRelease?: GitHubCommit[]
}

/**
 * Default pull request comment template.
 * This template is used when the user doesn't provide their own template.
 *
 * Note: This template is called multiple times:
 * 1. Initially with no results (just the header)
 * 2. After each simulated merge completes (showing only the latest result)
 *
 * The old behavior showed each result incrementally, not all at once.
 */
export const pullRequestCommentTemplate = `{{ if (results.length === 0) }}## decaf
Running deployments in test mode. Results will appear below. 
If this pull request and all of it's parent pull requests are merged using the...{{ else }}{{ set result = results[results.length - 1] }}{{ if (result.status === "success") }}{{ if (result.nextReleaseVersion) }}...🟩 **{{ result.mergeType }}** 🟩 merge method... 🚢 The next version of the project will be: **{{ result.nextReleaseVersion }}**

<details>
  <summary>Learn more</summary>
  <br>
  Latest release: {{ result.latestRelease?.versionName || "none, this is the first release." }}<br>
  Commit of latest release: {{ result.latestRelease?.commitSha || "none, this is the first release." }}<br>
  <br>
  Commits since last release:<br>
  - {{ result.commitsSinceLastRelease?.map(commit => commit.message).join("<br>- ") || "none" }}    
  </details>{{ else }}...🟩 **{{ result.mergeType }}** 🟩 merge method... 🌴 It will not trigger a deployment. No new version will be deployed.

<details>
  <summary>Learn more</summary>
  <br>
  Latest release: {{ result.latestRelease?.versionName || "none, this is the first release." }}<br>
  Commit of latest release: {{ result.latestRelease?.commitSha || "none, this is the first release." }}<br>
  <br>
  Commits since last release:<br>
  - {{ result.commitsSinceLastRelease?.map(commit => commit.message).join("<br>- ") || "none" }}    
  </details>{{ /if }}{{ else }}...🟩 **{{ result.mergeType }}** 🟩 merge method... ⚠️ There was an error during deployment run.{{ if (build.buildUrl) }} [See logs to learn more and fix the issue]({{ build.buildUrl }}).{{ else }} See CI server logs to learn more and fix the issue.{{ /if }}{{ /if }}{{ /if }}`
