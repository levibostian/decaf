import { assertEquals } from "@std/assert/equals"
import { assertStringIncludes } from "@std/assert"
import { postPullRequestComment, PullRequestCommentTemplateData } from "./pull-request-comment.ts"
import { mock, when } from "./mock/mock.ts"
import { GitHubApi } from "./github-api.ts"
import * as di from "./di.ts"

let diGraph: typeof di.productionDiGraph
let githubApiMock: GitHubApi

Deno.test.beforeEach(() => {
  di.clearOverride()
  diGraph = di.getGraph().createChild()
  githubApiMock = mock()
  diGraph = diGraph.override("github", () => githubApiMock)
  di.overrideStore(diGraph)
})

Deno.test.afterEach(() => {
  di.clearOverride()
})

Deno.test("postPullRequestComment - should render simple template with variables", async () => {
  const simpleTemplate = "PR: {{ pullRequest.prNumber }}, Owner: {{ repository.owner }}"

  const templateData: PullRequestCommentTemplateData = {
    simulatedMergeTypes: ["merge"],
    results: [],
    build: {
      buildId: "12345",
      ciService: "github",
    },
    pullRequest: {
      prNumber: 42,
      baseBranch: "feature",
      targetBranch: "main",
    },
    repository: {
      owner: "testowner",
      repo: "testrepo",
    },
  }

  const capturedMessages: string[] = []

  when(githubApiMock, "postStatusUpdateOnPullRequest", async (args) => {
    capturedMessages.push(args.message)
  })

  await postPullRequestComment({
    templateData,
    templateString: simpleTemplate,
    owner: "testowner",
    repo: "testrepo",
    prNumber: 42,
    ciBuildId: "12345",
    ciService: "github",
  })

  assertEquals(capturedMessages.length, 1, "Should post exactly one comment")
  assertEquals(capturedMessages[0], "PR: 42, Owner: testowner")
})

Deno.test("postPullRequestComment - should render template with array access", async () => {
  const arrayTemplate = "Merge types: {{ simulatedMergeTypes[0] }}, {{ simulatedMergeTypes[1] }}"

  const templateData: PullRequestCommentTemplateData = {
    simulatedMergeTypes: ["merge", "rebase"],
    results: [],
    build: {
      buildId: "12345",
      ciService: "github",
    },
    pullRequest: {
      prNumber: 1,
      baseBranch: "feature",
      targetBranch: "main",
    },
    repository: {
      owner: "owner",
      repo: "repo",
    },
  }

  const capturedMessages: string[] = []

  when(githubApiMock, "postStatusUpdateOnPullRequest", async (args) => {
    capturedMessages.push(args.message)
  })

  await postPullRequestComment({
    templateData,
    templateString: arrayTemplate,
    owner: "owner",
    repo: "repo",
    prNumber: 1,
    ciBuildId: "12345",
    ciService: "github",
  })

  assertEquals(capturedMessages.length, 1)
  assertEquals(capturedMessages[0], "Merge types: merge, rebase")
})

Deno.test("postPullRequestComment - should render template with conditional logic", async () => {
  const conditionalTemplate = "{{ if (results.length > 0) }}Has results{{ else }}No results{{ /if }}"

  const templateDataWithResults: PullRequestCommentTemplateData = {
    simulatedMergeTypes: ["merge"],
    results: [
      {
        mergeType: "merge",
        status: "success",
      },
    ],
    build: {
      buildId: "12345",
      ciService: "github",
    },
    pullRequest: {
      prNumber: 1,
      baseBranch: "feature",
      targetBranch: "main",
    },
    repository: {
      owner: "owner",
      repo: "repo",
    },
  }

  const templateDataWithoutResults: PullRequestCommentTemplateData = {
    ...templateDataWithResults,
    results: [],
  }

  const capturedMessages: string[] = []

  when(githubApiMock, "postStatusUpdateOnPullRequest", async (args) => {
    capturedMessages.push(args.message)
  })

  // Test with results
  await postPullRequestComment({
    templateData: templateDataWithResults,
    templateString: conditionalTemplate,
    owner: "owner",
    repo: "repo",
    prNumber: 1,
    ciBuildId: "12345",
    ciService: "github",
  })

  assertEquals(capturedMessages[0], "Has results")

  // Test without results
  await postPullRequestComment({
    templateData: templateDataWithoutResults,
    templateString: conditionalTemplate,
    owner: "owner",
    repo: "repo",
    prNumber: 1,
    ciBuildId: "12345",
    ciService: "github",
  })

  assertEquals(capturedMessages[1], "No results")
})

Deno.test("postPullRequestComment - should render template with nested properties", async () => {
  const nestedTemplate = "Build: {{ build.buildId }}, Service: {{ build.ciService }}"

  const templateData: PullRequestCommentTemplateData = {
    simulatedMergeTypes: ["merge"],
    results: [],
    build: {
      buildId: "abc-123",
      ciService: "circleci",
    },
    pullRequest: {
      prNumber: 1,
      baseBranch: "feature",
      targetBranch: "main",
    },
    repository: {
      owner: "owner",
      repo: "repo",
    },
  }

  const capturedMessages: string[] = []

  when(githubApiMock, "postStatusUpdateOnPullRequest", async (args) => {
    capturedMessages.push(args.message)
  })

  await postPullRequestComment({
    templateData,
    templateString: nestedTemplate,
    owner: "owner",
    repo: "repo",
    prNumber: 1,
    ciBuildId: "abc-123",
    ciService: "circleci",
  })

  assertEquals(capturedMessages[0], "Build: abc-123, Service: circleci")
})

Deno.test("postPullRequestComment - should pass all parameters to GitHub API correctly", async () => {
  const template = "Simple test"

  const templateData: PullRequestCommentTemplateData = {
    simulatedMergeTypes: ["merge"],
    results: [],
    build: {
      buildId: "build-999",
      ciService: "circleci",
    },
    pullRequest: {
      prNumber: 123,
      baseBranch: "feature",
      targetBranch: "main",
    },
    repository: {
      owner: "test-owner",
      repo: "test-repo",
    },
  }

  type CapturedArgs = {
    message: string
    owner: string
    repo: string
    prNumber: number
    ciBuildId: string
    ciService: string
  }

  const capturedArgs: CapturedArgs[] = []

  when(githubApiMock, "postStatusUpdateOnPullRequest", async (args) => {
    capturedArgs.push(args)
  })

  await postPullRequestComment({
    templateData,
    templateString: template,
    owner: "test-owner",
    repo: "test-repo",
    prNumber: 123,
    ciBuildId: "build-999",
    ciService: "circleci",
  })

  assertEquals(capturedArgs.length, 1)
  assertEquals(capturedArgs[0].owner, "test-owner")
  assertEquals(capturedArgs[0].repo, "test-repo")
  assertEquals(capturedArgs[0].prNumber, 123)
  assertEquals(capturedArgs[0].ciBuildId, "build-999")
  assertEquals(capturedArgs[0].ciService, "circleci")
  assertEquals(capturedArgs[0].message, "Simple test")
})

Deno.test("postPullRequestComment - should render multiline template correctly", async () => {
  const multilineTemplate = `Line 1: {{ repository.owner }}
Line 2: {{ repository.repo }}
Line 3: {{ pullRequest.prNumber }}`

  const templateData: PullRequestCommentTemplateData = {
    simulatedMergeTypes: ["merge"],
    results: [],
    build: {
      buildId: "12345",
      ciService: "github",
    },
    pullRequest: {
      prNumber: 99,
      baseBranch: "feature",
      targetBranch: "main",
    },
    repository: {
      owner: "multiline",
      repo: "test",
    },
  }

  const capturedMessages: string[] = []

  when(githubApiMock, "postStatusUpdateOnPullRequest", async (args) => {
    capturedMessages.push(args.message)
  })

  await postPullRequestComment({
    templateData,
    templateString: multilineTemplate,
    owner: "multiline",
    repo: "test",
    prNumber: 99,
    ciBuildId: "12345",
    ciService: "github",
  })

  assertEquals(capturedMessages.length, 1)
  assertStringIncludes(capturedMessages[0], "Line 1: multiline")
  assertStringIncludes(capturedMessages[0], "Line 2: test")
  assertStringIncludes(capturedMessages[0], "Line 3: 99")
})

Deno.test("postPullRequestComment - should render template with optional parameter", async () => {
  const template = "{{ if (build.buildUrl) }}URL: {{ build.buildUrl }}{{ else }}No URL{{ /if }}"

  const templateDataWithUrl: PullRequestCommentTemplateData = {
    simulatedMergeTypes: ["merge"],
    results: [],
    build: {
      buildId: "12345",
      ciService: "github",
      buildUrl: "https://example.com/build/12345",
    },
    pullRequest: {
      prNumber: 1,
      baseBranch: "feature",
      targetBranch: "main",
    },
    repository: {
      owner: "owner",
      repo: "repo",
    },
  }

  const templateDataWithoutUrl: PullRequestCommentTemplateData = {
    simulatedMergeTypes: ["merge"],
    results: [],
    build: {
      buildId: "12345",
      ciService: "github",
    },
    pullRequest: {
      prNumber: 1,
      baseBranch: "feature",
      targetBranch: "main",
    },
    repository: {
      owner: "owner",
      repo: "repo",
    },
  }

  const capturedMessages: string[] = []

  when(githubApiMock, "postStatusUpdateOnPullRequest", async (args) => {
    capturedMessages.push(args.message)
  })

  // With URL
  await postPullRequestComment({
    templateData: templateDataWithUrl,
    templateString: template,
    owner: "owner",
    repo: "repo",
    prNumber: 1,
    ciBuildId: "12345",
    ciService: "github",
  })

  assertEquals(capturedMessages[0], "URL: https://example.com/build/12345")

  // Without URL
  await postPullRequestComment({
    templateData: templateDataWithoutUrl,
    templateString: template,
    owner: "owner",
    repo: "repo",
    prNumber: 1,
    ciBuildId: "12345",
    ciService: "github",
  })

  assertEquals(capturedMessages[1], "No URL")
})

Deno.test("postPullRequestComment - should render template with for loop through results", async () => {
  const loopTemplate = `Results:
{{ for result of results }}
- {{ result.mergeType }}: {{ result.status }}{{ if (result.nextReleaseVersion) }} (v{{ result.nextReleaseVersion }}){{ /if }}
{{ /for }}`

  const templateData: PullRequestCommentTemplateData = {
    simulatedMergeTypes: ["merge", "rebase", "squash"],
    results: [
      {
        mergeType: "merge",
        status: "success",
        nextReleaseVersion: "1.2.0",
        latestRelease: {
          versionName: "1.1.0",
          commitSha: "abc123",
        },
        commitsSinceLastRelease: [],
      },
      {
        mergeType: "rebase",
        status: "success",
        nextReleaseVersion: "1.2.0",
        latestRelease: {
          versionName: "1.1.0",
          commitSha: "abc123",
        },
        commitsSinceLastRelease: [],
      },
      {
        mergeType: "squash",
        status: "error",
      },
    ],
    build: {
      buildId: "12345",
      ciService: "github",
    },
    pullRequest: {
      prNumber: 1,
      baseBranch: "feature",
      targetBranch: "main",
    },
    repository: {
      owner: "owner",
      repo: "repo",
    },
  }

  const capturedMessages: string[] = []

  when(githubApiMock, "postStatusUpdateOnPullRequest", async (args) => {
    capturedMessages.push(args.message)
  })

  await postPullRequestComment({
    templateData,
    templateString: loopTemplate,
    owner: "owner",
    repo: "repo",
    prNumber: 1,
    ciBuildId: "12345",
    ciService: "github",
  })

  assertEquals(capturedMessages.length, 1)
  assertStringIncludes(capturedMessages[0], "- merge: success (v1.2.0)")
  assertStringIncludes(capturedMessages[0], "- rebase: success (v1.2.0)")
  assertStringIncludes(capturedMessages[0], "- squash: error")
})
