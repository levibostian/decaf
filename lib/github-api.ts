import * as log from "./log.ts"

export interface GitHubRelease {
  tag: {
    name: string
    commit: {
      sha: string
    }
  }
  name: string
  created_at: Date
}

export interface GitHubCommit {
  sha: string
  message: string
  date: Date
}

interface GitHubCommitApiResponse {
  sha: string
  commit: {
    message: string
    committer: {
      date: string
    }
  }
}

export interface GitHubPullRequest {
  prNumber: number
  targetBranchName: string
  sourceBranchName: string
  title: string
  description: string
}

// Returns list of all open pull requests that are stacked on top of each other.
// Index 0 is the newest pull request.
const getPullRequestStack = async (
  { owner, repo, startingBranch }: { owner: string; repo: string; startingBranch: string },
): Promise<GitHubPullRequest[]> => {
  // get list of all open pull requests.
  const graphqlQuery = `
query($owner: String!, $repo: String!, $endCursor: String, $numberOfResults: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: $numberOfResults, states: [OPEN], after: $endCursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        prNumber: number
        targetBranchName: baseRefName
        sourceBranchName: headRefName     
        title: title
        description: body # description in markdown. you can do html or text instead. 
      }
      pageInfo {        
        endCursor
        hasNextPage
      }
    }
  }
}
`

  let pullRequests: GitHubPullRequest[] = []

  await githubGraphqlRequestPaging<{
    data: {
      repository: {
        pullRequests: {
          nodes: {
            prNumber: number
            targetBranchName: string
            sourceBranchName: string
            title: string
            description: string
          }[]
          pageInfo: {
            endCursor: string
            hasNextPage: boolean
          }
        }
      }
    }
  }>(
    graphqlQuery,
    { owner, repo, numberOfResults: 100 },
    async (response) => {
      pullRequests.push(...response.data.repository.pullRequests.nodes)
      return true
    },
  )

  // Takes the list of all pull requests for the repo and puts into a list, starting at the startingBranch PR, and creates the stack. Going from starting to the top of the stack (example: PR 1 -> PR 2 -> PR 3).
  const startingPullRequest = pullRequests.find((pr) => pr.sourceBranchName === startingBranch)
  if (!startingPullRequest) {
    throw new Error(
      `Could not get pull request stack because not able to find pull request for starting branch, ${startingBranch}. This is unexpected.`,
    )
  }

  const prStack: GitHubPullRequest[] = [startingPullRequest]
  let sourceBranchSearchingFor = startingBranch

  while (true) {
    const nextPullRequest = pullRequests.find((pr) => pr.targetBranchName === sourceBranchSearchingFor)

    if (!nextPullRequest) {
      break
    }

    prStack.push(nextPullRequest)
    sourceBranchSearchingFor = nextPullRequest.sourceBranchName
  }

  return prStack
}

// Get a list of github releases.
// The github rest api does not return the git tag (and commit sha) for a release. You would need to also call the tags endpoint and match the tag name to the release name (painful).
// But I found you can use the github graphql api to get this information in 1 call.
const getTagsWithGitHubReleases = async (
  { sampleData, owner, repo, processReleases, numberOfResults }: {
    sampleData?: GitHubRelease[]
    owner: string
    repo: string
    processReleases: (data: GitHubRelease[]) => Promise<boolean>
    numberOfResults?: number
  },
): Promise<void> => {
  // Gets list of tags that also have a github release made for it.
  // If a tag does not have a release, it will not be returned.
  // Sorted by latest release first.
  // Paging enabled.
  const graphqlQuery = `
query($owner: String!, $repo: String!, $endCursor: String, $numberOfResults: Int!) {
  repository(owner: $owner, name: $repo) {
    releases(first: $numberOfResults, after: $endCursor) {
      nodes {
        name # name of github release 
        createdAt # "2024-06-06T04:26:30Z"
        isDraft # true if release is a draft
        tag {
          name # tag name 
          target {
            ... on Commit {
              oid # commit sha hash
            }
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
}
`

  if (sampleData) {
    await processReleases(sampleData)
    return
  }

  await githubGraphqlRequestPaging<{
    data: {
      repository: {
        releases: {
          nodes: {
            name: string
            createdAt: string
            isDraft: boolean
            tag: {
              name: string
              target: {
                oid: string
              }
            }
          }[]
          pageInfo: {
            endCursor: string
            hasNextPage: boolean
          }
        }
      }
    }
  }>(
    graphqlQuery,
    { owner, repo, numberOfResults: numberOfResults || 100 },
    (response) => {
      const releases: GitHubRelease[] = response.data.repository.releases.nodes
        .filter((release) => !release.isDraft) // only look at releases that are not drafts
        .map((release) => {
          return {
            tag: {
              name: release.tag.name,
              commit: {
                sha: release.tag.target.oid,
              },
            },
            name: release.name,
            created_at: new Date(release.createdAt),
          }
        })

      return processReleases(releases)
    },
  )
}

const getCommitsForBranch = async <T>(
  { sampleData, owner, repo, branch, processCommits }: {
    sampleData?: GitHubCommit[]
    owner: string
    repo: string
    branch: string
    processCommits: (data: GitHubCommit[]) => Promise<boolean>
  },
) => {
  if (sampleData) {
    await processCommits(sampleData)
    return
  }

  return await githubApiRequestPaging<GitHubCommitApiResponse[]>(
    `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=100`,
    async (apiResponse) => {
      return await processCommits(apiResponse.map((response) => {
        return {
          sha: response.sha,
          message: response.commit.message,
          date: new Date(response.commit.committer.date),
        }
      }))
    },
  )
}

// Make a GitHub Rest API request.
const githubApiRequest = async <T>(
  url: string,
  method: "GET" | "POST" = "GET",
  body: object | undefined = undefined,
) => {
  const headers = {
    "Authorization": `Bearer ${Deno.env.get("INPUT_GITHUB_TOKEN")}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  }

  log.debug(
    `GitHub API request: ${method}:${url}, headers: ${JSON.stringify(headers)}, body: ${JSON.stringify(body)}`,
  )

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    throw new Error(
      `Failed to call github API endpoint: ${url}, given error: ${response.statusText}`,
    )
  }

  const responseJsonBody: T = await response.json()

  return {
    status: response.status,
    body: responseJsonBody,
    headers: response.headers,
  }
}

// Make a GitHub Rest API request that supports paging. Takes in a function that gets called for each page of results.
// In that function, return true if you want to get the next page of results.
async function githubApiRequestPaging<RESPONSE>(
  initialUrl: string,
  processResponse: (data: RESPONSE) => Promise<boolean>,
): Promise<void> {
  let url = initialUrl
  let getNextPage = true

  while (getNextPage) {
    const response = await githubApiRequest<RESPONSE>(url)

    getNextPage = await processResponse(response.body)

    // for propagation, add nextLink to responseJsonBody. It's the URL that should be used in the next HTTP request to get the next page of results.
    const linkHeader = response.headers.get("Link")?.match(
      /<(.*?)>; rel="next"/,
    )
    const nextPageUrl = linkHeader ? linkHeader[1] : undefined

    if (!nextPageUrl) {
      getNextPage = false
    } else {
      url = nextPageUrl
    }
  }
}

/*

  // Make a GitHub GraphQL API request.

  Example:
  // const QUERY = `
  // query($owner: String!, $name: String!) {
  //   repository(owner: $owner, name: $name) {
  //     releases(first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
  //       nodes {
  //         name
  //         createdAt
  //         tag {
  //           name
  //           target {
  //             ... on Commit {
  //               oid
  //             }
  //           }
  //         }
  //       }
  //     }
  //   }
  // }
  // `;
  // const variables = {
  //   owner: 'REPO_OWNER', // Replace with the repository owner
  //   name: 'REPO_NAME'    // Replace with the repository name
  // };
*/
const githubGraphqlRequest = async <T>(query: string, variables: object) => {
  const headers = {
    "Authorization": `Bearer ${Deno.env.get("INPUT_GITHUB_TOKEN")}`,
    "Content-Type": "application/json",
  }

  const body = JSON.stringify({
    query,
    variables,
  })

  log.debug(
    `GitHub graphql request: headers: ${JSON.stringify(headers)}, body: ${body}`,
  )

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body,
  })

  if (!response.ok) {
    throw new Error(
      `Failed to call github graphql api. Given error: ${response.statusText}`,
    )
  }

  const responseJsonBody: T = await response.json()

  log.debug(`GitHub graphql response: ${JSON.stringify(responseJsonBody)}`)

  return {
    status: response.status,
    body: responseJsonBody,
    headers: response.headers,
  }
}

// Make a GitHub GraphQL API request that supports paging. Takes in a function that gets called for each page of results.
// Assumptions when using this function:
// 1. Query must contain a pageInfo object:
// pageInfo {
//  endCursor
//  hasNextPage
// }
// 2. Query contains a variable called endCursor that is used to page through results.
// See: https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api to learn more about these assumptions.
async function githubGraphqlRequestPaging<RESPONSE>(
  query: string,
  variables: { [key: string]: string | number },
  processResponse: (data: RESPONSE) => Promise<boolean>,
): Promise<void> {
  // deno-lint-ignore no-explicit-any
  function findPageInfo(
    _obj: any,
  ): { hasNextPage: boolean; endCursor: string } {
    // Create a shallow copy of the object to avoid modifying the original
    const obj = { ..._obj }

    // nodes is the JSON response. It could be a really big object. Do not perform recursion on it, so let's delete it.
    delete obj["nodes"]

    for (const key in obj) {
      if (key === "pageInfo") {
        return obj[key] as { hasNextPage: boolean; endCursor: string }
      } else {
        return findPageInfo(obj[key])
      }
    }

    throw new Error(
      "pageInfo object not found in response. Did you forget to add pageInfo to your graphql query?",
    )
  }

  let getNextPage = true
  while (getNextPage) {
    const response = await githubGraphqlRequest<RESPONSE>(query, variables)

    getNextPage = await processResponse(response.body)

    const pageInfo = findPageInfo(response.body)

    log.debug(`pageInfo: ${JSON.stringify(pageInfo)}`)

    if (!pageInfo.hasNextPage) {
      getNextPage = false
    } else {
      variables["endCursor"] = pageInfo.endCursor
    }
  }
}

export interface GitHubApi {
  getTagsWithGitHubReleases: typeof getTagsWithGitHubReleases
  getCommitsForBranch: typeof getCommitsForBranch
  getPullRequestStack: typeof getPullRequestStack
}

export const GitHubApiImpl: GitHubApi = {
  getTagsWithGitHubReleases,
  getCommitsForBranch,
  getPullRequestStack,
}
