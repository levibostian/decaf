import { assertEquals } from "@std/assert"
import { EnvironmentImpl } from "./environment.ts"
import { mock, when } from "./mock/mock.ts"
import { GitHubApi } from "./github-api.ts"
import { processCommandLineArgs } from "../cli.ts"

let environment: EnvironmentImpl
let githubApiMock: GitHubApi = mock()
Deno.test.beforeEach(() => {
  // Set fake CI environment. especially required for env-ci library
  // must do before creating EnvironmentImpl instance
  Deno.env.set("CI", "true")
  Deno.env.set("GITHUB_ACTIONS", "true")
  Deno.env.set("GITHUB_REPOSITORY", "testowner/testrepo")
  Deno.env.set("GITHUB_SHA", "abc123")
  Deno.env.set("GITHUB_RUN_ID", "123456")
  Deno.env.set("GITHUB_REF", "refs/heads/main")

  githubApiMock = mock()
  environment = new EnvironmentImpl(githubApiMock)
})

Deno.test("getBranchFilters - should return empty array when branch_filters input is not set", () => {
  // Ensure the environment variable is not set
  Deno.env.delete("INPUT_BRANCH_FILTERS")

  const result = environment.getBranchFilters()

  assertEquals(result, [])
})

Deno.test("getBranchFilters - should return empty array when branch_filters input is empty string", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "")

  const result = environment.getBranchFilters()

  assertEquals(result, [])
})

Deno.test("getBranchFilters - should return empty array when branch_filters input contains only whitespace", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "   ")

  const result = environment.getBranchFilters()

  assertEquals(result, [])
})

Deno.test("getBranchFilters - should return single filter when one branch is specified", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "main")

  const result = environment.getBranchFilters()

  assertEquals(result, ["main"])
})

Deno.test("getBranchFilters - should return multiple filters when comma-separated branches are specified", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "main,develop,feature")

  const result = environment.getBranchFilters()

  assertEquals(result, ["main", "develop", "feature"])
})

Deno.test("getBranchFilters - should trim whitespace from each filter", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", " main , develop , feature ")

  const result = environment.getBranchFilters()

  assertEquals(result, ["main", "develop", "feature"])
})

Deno.test("getBranchFilters - should filter out empty strings after splitting", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "main,,develop,  ,feature")

  const result = environment.getBranchFilters()

  assertEquals(result, ["main", "develop", "feature"])
})

Deno.test("getBranchFilters - should handle single comma-separated value with extra commas", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", ",main,")

  const result = environment.getBranchFilters()

  assertEquals(result, ["main"])
})

Deno.test("getBranchFilters - should handle complex branch names with special characters", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "feature/new-deployment,bugfix/issue-123,release/v1.0.0")

  const result = environment.getBranchFilters()

  assertEquals(result, ["feature/new-deployment", "bugfix/issue-123", "release/v1.0.0"])
})

Deno.test("getBranchFilters - should return empty array when all filters are empty after trimming", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", " , , ")

  const result = environment.getBranchFilters()

  assertEquals(result, [])
})

Deno.test("getBranchFilters - should handle glob patterns with asterisk", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "feature/*,release/*,hotfix/*")

  const result = environment.getBranchFilters()

  assertEquals(result, ["feature/*", "release/*", "hotfix/*"])
})

Deno.test("getBranchFilters - should handle glob patterns with question mark", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "v?.?.?,release-v?")

  const result = environment.getBranchFilters()

  assertEquals(result, ["v?.?.?", "release-v?"])
})

Deno.test("getBranchFilters - should handle mixed glob patterns and literal branch names", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "main,develop,feature/*,release/v*,bugfix-*")

  const result = environment.getBranchFilters()

  assertEquals(result, ["main", "develop", "feature/*", "release/v*", "bugfix-*"])
})

Deno.test("getBranchFilters - should handle glob patterns with square brackets", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "release/[0-9]*,feature/[a-z]*,v[0-9].[0-9].[0-9]")

  const result = environment.getBranchFilters()

  assertEquals(result, ["release/[0-9]*", "feature/[a-z]*", "v[0-9].[0-9].[0-9]"])
})

Deno.test("getBranchFilters - should handle complex glob patterns with multiple wildcards", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "*/feature/*,*-hotfix-*,release-*-*")

  const result = environment.getBranchFilters()

  assertEquals(result, ["*/feature/*", "*-hotfix-*", "release-*-*"])
})

Deno.test("getBranchFilters - should handle glob patterns with braces containing commas", () => {
  // Now that we have brace-aware splitting, patterns with commas inside braces work correctly
  Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new,old}/*,release/{alpha,beta,rc}")

  const result = environment.getBranchFilters()

  // The function now properly handles brace patterns with commas
  assertEquals(result, ["feature/{new,old}/*", "release/{alpha,beta,rc}"])
})

Deno.test("getBranchFilters - should handle complex brace patterns with mixed content", () => {
  // Test complex patterns mixing literals and brace expansions
  Deno.env.set("INPUT_BRANCH_FILTERS", "main,feature/{ui,api,db}/*,release-{v1,v2}.*,hotfix")

  const result = environment.getBranchFilters()

  assertEquals(result, ["main", "feature/{ui,api,db}/*", "release-{v1,v2}.*", "hotfix"])
})

Deno.test("getBranchFilters - should handle nested braces", () => {
  // Test nested brace patterns (though less common in practice)
  Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new/{ui,api},old/*}")

  const result = environment.getBranchFilters()

  assertEquals(result, ["feature/{new/{ui,api},old/*}"])
})

Deno.test("getBranchFilters - should handle braces with whitespace", () => {
  // Test brace patterns with spaces around commas inside braces
  Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new, old, legacy}/* , release/{alpha, beta}")

  const result = environment.getBranchFilters()

  assertEquals(result, ["feature/{new, old, legacy}/*", "release/{alpha, beta}"])
})

Deno.test("getBranchFilters - should handle glob patterns with braces without commas", () => {
  // Brace patterns work fine when they don't contain commas
  Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new}/*,release/{alpha}")

  const result = environment.getBranchFilters()

  assertEquals(result, ["feature/{new}/*", "release/{alpha}"])
})

Deno.test("getBranchFilters - should handle glob patterns with whitespace around them", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", " feature/* , release/v* , hotfix-* ")

  const result = environment.getBranchFilters()

  assertEquals(result, ["feature/*", "release/v*", "hotfix-*"])
})

Deno.test("getBranchFilters - should handle escaped glob characters", () => {
  Deno.env.set("INPUT_BRANCH_FILTERS", "feature\\*literal,branch\\?name,release\\[test\\]")

  const result = environment.getBranchFilters()

  assertEquals(result, ["feature\\*literal", "branch\\?name", "release\\[test\\]"])
})

Deno.test("getCommitLimit - should return 500 when commit_limit input is not set", () => {
  // Ensure the environment variable is not set
  Deno.env.delete("INPUT_COMMIT_LIMIT")

  const result = environment.getCommitLimit()

  assertEquals(result, 500)
})

Deno.test("getCommitLimit - should return 500 when commit_limit input is empty string", () => {
  Deno.env.set("INPUT_COMMIT_LIMIT", "")

  const result = environment.getCommitLimit()

  assertEquals(result, 500)
})

Deno.test("getCommitLimit - should return valid number when commit_limit is set", () => {
  Deno.env.set("INPUT_COMMIT_LIMIT", "100")

  const result = environment.getCommitLimit()

  assertEquals(result, 100)
})

Deno.test("getCommitLimit - should return 500 when commit_limit is invalid", () => {
  Deno.env.set("INPUT_COMMIT_LIMIT", "not-a-number")

  const result = environment.getCommitLimit()

  assertEquals(result, 500)
})

Deno.test("getCommitLimit - should return 500 when commit_limit is zero or negative", () => {
  Deno.env.set("INPUT_COMMIT_LIMIT", "0")

  const result = environment.getCommitLimit()

  assertEquals(result, 500)

  // Test negative number
  Deno.env.set("INPUT_COMMIT_LIMIT", "-10")
  const result2 = environment.getCommitLimit()
  assertEquals(result2, 500)
})

Deno.test("getCommandsForStep - should return undefined when step input is not set", () => {
  const stepName = "deploy"

  Deno.env.delete(`INPUT_${stepName.toUpperCase()}`)

  const result = environment.getCommandsForStep({ stepName })

  assertEquals(result, undefined)
})

Deno.test("getCommandsForStep - should return undefined when step input is empty string", () => {
  const stepName = "deploy"

  Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "")

  const result = environment.getCommandsForStep({ stepName })

  assertEquals(result, undefined)
})

Deno.test("getCommandsForStep - should return single command array when single command is provided", () => {
  const stepName = "deploy"

  Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "npm run deploy")

  const result = environment.getCommandsForStep({ stepName })

  assertEquals(result, ["npm run deploy"])
})

Deno.test("getCommandsForStep - should return multiple commands when separated by newlines", () => {
  const stepName = "deploy"

  Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "npm run build\nnpm run test\nnpm run deploy")

  const result = environment.getCommandsForStep({ stepName })

  assertEquals(result, ["npm run build", "npm run test", "npm run deploy"])
})

Deno.test("getCommandsForStep - should trim whitespace from each command", () => {
  const stepName = "deploy"

  Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "  npm run build  \n  npm run test  \n  npm run deploy  ")

  const result = environment.getCommandsForStep({ stepName })

  assertEquals(result, ["npm run build", "npm run test", "npm run deploy"])
})

Deno.test("getCommandsForStep - should filter out empty lines", () => {
  const stepName = "deploy"

  Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "npm run build\n\nnpm run test\n  \nnpm run deploy")

  const result = environment.getCommandsForStep({ stepName })

  assertEquals(result, ["npm run build", "npm run test", "npm run deploy"])
})

Deno.test("getCommandsForStep - should return undefined when only whitespace and newlines", () => {
  const stepName = "deploy"

  Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "\n  \n\n  ")

  const result = environment.getCommandsForStep({ stepName })

  assertEquals(result, undefined)
})

Deno.test("getCommandsForStep - should handle commands with special characters", () => {
  const stepName = "deploy"

  Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "echo 'hello world'\ngit commit -m \"test\"\ncurl https://api.example.com")

  const result = environment.getCommandsForStep({ stepName })

  assertEquals(result, ["echo 'hello world'", 'git commit -m "test"', "curl https://api.example.com"])
})

// -------

Deno.test("getSimulatedMergeTypes - should return merge type when merge type is set by user", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "merge")
  assertEquals(await environment.getSimulatedMergeTypes(), ["merge"])
})

Deno.test("getSimulatedMergeTypes - should return squash type when squash type is set by user", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "squash")
  assertEquals(await environment.getSimulatedMergeTypes(), ["squash"])
})

Deno.test("getSimulatedMergeTypes - should return rebase type when rebase type is set by user", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "rebase")
  assertEquals(await environment.getSimulatedMergeTypes(), ["rebase"])
})

Deno.test("getSimulatedMergeTypes - should return cached value on subsequent calls", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "merge")
  assertEquals(await environment.getSimulatedMergeTypes(), ["merge"])

  // Change the environment variable, but should still return cached value
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "squash")
  assertEquals(await environment.getSimulatedMergeTypes(), ["merge"])
})

Deno.test("getSimulatedMergeTypes - should return all merge types when INPUT_SIMULATED_MERGE_TYPE is not set and defaults are used", async () => {
  // Don't set INPUT_SIMULATED_MERGE_TYPE
  Deno.env.delete("INPUT_SIMULATED_MERGE_TYPE")

  let apiCalled = false
  when(githubApiMock, "getRepoMergeTypes", async (_args) => {
    apiCalled = true
    throw new Error("API should not be called when defaults are used")
  })

  const result = await environment.getSimulatedMergeTypes()

  // When no input is provided and API fails/not available, should default to all types
  assertEquals(result, ["merge", "squash", "rebase"])
  assertEquals(apiCalled, true)
})

Deno.test("getSimulatedMergeTypes - should call GitHub API when INPUT_SIMULATED_MERGE_TYPE is not set and return only merge", async () => {
  Deno.env.delete("INPUT_SIMULATED_MERGE_TYPE")

  when(githubApiMock, "getRepoMergeTypes", async (_args) => {
    return {
      allowMergeCommit: true,
      allowSquashMerge: false,
      allowRebaseMerge: false,
    }
  })

  const result = await environment.getSimulatedMergeTypes()

  assertEquals(result, ["merge"])
})

Deno.test("getSimulatedMergeTypes - should call GitHub API when INPUT_SIMULATED_MERGE_TYPE is not set and return only squash", async () => {
  Deno.env.delete("INPUT_SIMULATED_MERGE_TYPE")

  when(githubApiMock, "getRepoMergeTypes", async (_args) => {
    return {
      allowMergeCommit: false,
      allowSquashMerge: true,
      allowRebaseMerge: false,
    }
  })

  const result = await environment.getSimulatedMergeTypes()

  assertEquals(result, ["squash"])
})

Deno.test("getSimulatedMergeTypes - should call GitHub API when INPUT_SIMULATED_MERGE_TYPE is not set and return only rebase", async () => {
  Deno.env.delete("INPUT_SIMULATED_MERGE_TYPE")

  when(githubApiMock, "getRepoMergeTypes", async (_args) => {
    return {
      allowMergeCommit: false,
      allowSquashMerge: false,
      allowRebaseMerge: true,
    }
  })

  const result = await environment.getSimulatedMergeTypes()

  assertEquals(result, ["rebase"])
})

Deno.test("getSimulatedMergeTypes - should return all merge types when all merge types are allowed", async () => {
  Deno.env.delete("INPUT_SIMULATED_MERGE_TYPE")

  when(githubApiMock, "getRepoMergeTypes", async (_args) => {
    return {
      allowMergeCommit: true,
      allowSquashMerge: true,
      allowRebaseMerge: true,
    }
  })

  const result = await environment.getSimulatedMergeTypes()

  assertEquals(result, ["merge", "squash", "rebase"])
})

Deno.test("getSimulatedMergeTypes - should prioritize user input over GitHub API", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "rebase")

  let apiCalled = false
  when(githubApiMock, "getRepoMergeTypes", async (_args) => {
    apiCalled = true
    return {
      allowMergeCommit: true,
      allowSquashMerge: true,
      allowRebaseMerge: false,
    }
  })

  const result = await environment.getSimulatedMergeTypes()

  // Should return rebase from user input, not merge from API
  assertEquals(result, ["rebase"])
  assertEquals(apiCalled, false)
})

Deno.test("getSimulatedMergeTypes - should cache GitHub API result on subsequent calls", async () => {
  Deno.env.delete("INPUT_SIMULATED_MERGE_TYPE")

  let apiCallCount = 0
  when(githubApiMock, "getRepoMergeTypes", async (_args) => {
    apiCallCount++
    return {
      allowMergeCommit: false,
      allowSquashMerge: true,
      allowRebaseMerge: false,
    }
  })

  const firstResult = await environment.getSimulatedMergeTypes()
  assertEquals(firstResult, ["squash"])
  assertEquals(apiCallCount, 1)

  const secondResult = await environment.getSimulatedMergeTypes()
  assertEquals(secondResult, ["squash"])
  // API should only be called once due to caching
  assertEquals(apiCallCount, 1)
})

Deno.test("getSimulatedMergeTypes - should fallback to API when invalid user input is provided", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "invalid-value")

  let apiCalled = false
  when(githubApiMock, "getRepoMergeTypes", async (_args) => {
    apiCalled = true
    return {
      allowMergeCommit: false,
      allowSquashMerge: true,
      allowRebaseMerge: false,
    }
  })

  const result = await environment.getSimulatedMergeTypes()

  // Should fallback to API result since input is invalid
  assertEquals(result, ["squash"])
  assertEquals(apiCalled, true)
})

Deno.test("getSimulatedMergeTypes - should handle comma-separated merge types", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "merge,squash")
  assertEquals(await environment.getSimulatedMergeTypes(), ["merge", "squash"])
})

Deno.test("getSimulatedMergeTypes - should handle comma-separated merge types with all three types", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "merge,squash,rebase")
  assertEquals(await environment.getSimulatedMergeTypes(), ["merge", "squash", "rebase"])
})

Deno.test("getSimulatedMergeTypes - should handle comma-separated merge types with whitespace", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", " merge , squash , rebase ")
  assertEquals(await environment.getSimulatedMergeTypes(), ["merge", "squash", "rebase"])
})

Deno.test("getSimulatedMergeTypes - should filter out invalid types from comma-separated list", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "merge,invalid,squash")
  assertEquals(await environment.getSimulatedMergeTypes(), ["merge", "squash"])
})

Deno.test("getSimulatedMergeTypes - should handle comma-separated types with empty strings", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "merge,,squash")
  assertEquals(await environment.getSimulatedMergeTypes(), ["merge", "squash"])
})

Deno.test("getSimulatedMergeTypes - should handle comma-separated types with duplicates", async () => {
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", "merge,merge,squash")
  assertEquals(await environment.getSimulatedMergeTypes(), ["merge", "merge", "squash"])
})
Deno.test("getUserConfigurationOptions - expect get from command line argument", async () => {
  processCommandLineArgs([
    "--fail_on_deploy_verification=true",
    "--make_pull_request_comment=true",
  ])

  assertEquals(environment.getUserConfigurationOptions().failOnDeployVerification, true)
  assertEquals(environment.getUserConfigurationOptions().makePullRequestComment, true)

  processCommandLineArgs([
    "--fail_on_deploy_verification=false",
    "--make_pull_request_comment=false",
  ])

  assertEquals(environment.getUserConfigurationOptions().failOnDeployVerification, false)
  assertEquals(environment.getUserConfigurationOptions().makePullRequestComment, false)
})

Deno.test("getGitConfigInput - expect get from command line argument", async () => {
  processCommandLineArgs([
    "--git_config=Test User <test@example.com>",
  ])

  assertEquals(environment.getGitConfigInput()?.name, "Test User")
  assertEquals(environment.getGitConfigInput()?.email, "test@example.com")
})
