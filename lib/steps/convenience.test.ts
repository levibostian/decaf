import { assertEquals } from "@std/assert"
import { ConvenienceStepImpl } from "./convenience.ts"
import { mock, when } from "../mock/mock.ts"
import { Environment } from "../environment.ts"
import { logger } from "../log.ts"
import { Git } from "../git.ts"
import { GitCommit } from "../types/git.ts"
import { GitCommitFake } from "../types/git.test.ts"

Deno.test("ConvenienceStepImpl", async (t) => {
  let mockEnvironment: Environment
  let mockGit: Git
  let convenience: ConvenienceStepImpl

  function setupMocks() {
    mockEnvironment = mock<Environment>()
    mockGit = mock<Git>()

    // Mock environment methods
    when(mockEnvironment, "getCommitLimit", () => 500)

    convenience = new ConvenienceStepImpl(mockEnvironment, mockGit, logger)
  }

  const createMockCommit = (): GitCommit => new GitCommitFake({})

  await t.step("should set git config when user provides git committer config", async () => {
    setupMocks()

    const gitConfig = { name: "Test User", email: "test@example.com" }
    when(mockEnvironment, "getGitConfigInput", () => gitConfig)
    when(mockGit, "getBranches", () => Promise.resolve(new Map([["main", { ref: "origin/main" }]])))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve([]))

    await convenience.runConvenienceCommands()

    // Verify that git.setUser was called with the correct arguments
    const setUserCalls = (mockGit.setUser as unknown as { calls: { args: [{ name: string; email: string }] }[] }).calls
    assertEquals(setUserCalls.length, 1, "git.setUser should be called once")
    assertEquals(setUserCalls[0].args[0].name, "Test User", "git.setUser should be called with correct name")
    assertEquals(setUserCalls[0].args[0].email, "test@example.com", "git.setUser should be called with correct email")
  })

  await t.step("should not set git config when user does not provide git committer config", async () => {
    setupMocks()

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(new Map([["main", { ref: "origin/main" }]])))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve([]))

    await convenience.runConvenienceCommands()

    // Verify that git.setUser was not called
    const setUserCalls = (mockGit.setUser as unknown as { calls?: unknown[] }).calls
    assertEquals(setUserCalls === undefined || setUserCalls.length === 0, true, "git.setUser should not be called")
  })

  await t.step("should get commits for all local branches when no filters provided", async () => {
    setupMocks()

    const branches = ["main", "feature", "develop"]
    const branchesMap = new Map([
      ["main", { ref: "origin/main" }],
      ["feature", { ref: "origin/feature" }],
      ["develop", { ref: "origin/develop" }],
    ])
    const mockCommits: GitCommit[] = [createMockCommit()]

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branchesMap))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve(mockCommits))

    const result = await convenience.runConvenienceCommands()

    // Verify getCommits was called for each branch
    const getCommitsCalls = (mockGit.getCommits as unknown as { calls: unknown[] }).calls
    assertEquals(getCommitsCalls.length, branches.length, "getCommits should be called for each branch")

    // Verify result structure
    assertEquals(Object.keys(result.gitCommitsAllLocalBranches).length, branches.length)
    assertEquals(result.gitCommitsCurrentBranch, mockCommits)

    branches.forEach((branch) => {
      assertEquals(result.gitCommitsAllLocalBranches[branch], mockCommits)
    })
  })

  await t.step("should filter branches based on provided filters", async () => {
    setupMocks()

    const branchesMap = new Map([
      ["main", { ref: "origin/main" }],
      ["feature/test", { ref: "origin/feature/test" }],
      ["hotfix/urgent", { ref: "origin/hotfix/urgent" }],
      ["develop", { ref: "origin/develop" }],
    ])
    const mockCommits: GitCommit[] = [createMockCommit()]

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branchesMap))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve(mockCommits))

    const result = await convenience.runConvenienceCommands(["feature/*", "main"])

    // Should include main (current branch), feature/test (matches filter), but not hotfix/urgent or develop
    const expectedBranches = ["main", "feature/test"]
    assertEquals(Object.keys(result.gitCommitsAllLocalBranches).length, expectedBranches.length)

    expectedBranches.forEach((branch) => {
      assertEquals(result.gitCommitsAllLocalBranches[branch] !== undefined, true, `Branch ${branch} should be included`)
    })

    // Verify current branch is included regardless of filters
    assertEquals(result.gitCommitsCurrentBranch, mockCommits)
  })

  await t.step("should always include current branch even when it doesn't match filters", async () => {
    setupMocks()

    const branchesMap = new Map([
      ["main", { ref: "origin/main" }],
      ["feature/test", { ref: "origin/feature/test" }],
      ["develop", { ref: "origin/develop" }],
    ])
    const mockCommits: GitCommit[] = [createMockCommit()]

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branchesMap))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve(mockCommits))

    // Filter that doesn't match current branch "main"
    const result = await convenience.runConvenienceCommands(["feature/*"])

    // Should include main (current branch) and feature/test (matches filter)
    const expectedBranches = ["main", "feature/test"]
    assertEquals(Object.keys(result.gitCommitsAllLocalBranches).length, expectedBranches.length)

    // Verify current branch is included
    assertEquals(result.gitCommitsAllLocalBranches["main"], mockCommits)
    assertEquals(result.gitCommitsCurrentBranch, mockCommits)
  })

  await t.step("should handle empty branch list", async () => {
    setupMocks()

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(new Map()))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))

    const result = await convenience.runConvenienceCommands()

    assertEquals(Object.keys(result.gitCommitsAllLocalBranches).length, 0)
    assertEquals(result.gitCommitsCurrentBranch, undefined)
  })

  await t.step("should handle glob patterns in branch filters", async () => {
    setupMocks()

    const branchesMap = new Map([
      ["main", { ref: "origin/main" }],
      ["release/v1.0", { ref: "origin/release/v1.0" }],
      ["release/v2.0", { ref: "origin/release/v2.0" }],
      ["feature/auth", { ref: "origin/feature/auth" }],
      ["bugfix/login", { ref: "origin/bugfix/login" }],
    ])
    const mockCommits: GitCommit[] = [createMockCommit()]

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branchesMap))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve(mockCommits))

    const result = await convenience.runConvenienceCommands(["release/*", "feature/*"])

    // Should include main (current), release/v1.0, release/v2.0, feature/auth
    const expectedBranches = ["main", "release/v1.0", "release/v2.0", "feature/auth"]
    assertEquals(Object.keys(result.gitCommitsAllLocalBranches).length, expectedBranches.length)

    expectedBranches.forEach((branch) => {
      assertEquals(result.gitCommitsAllLocalBranches[branch] !== undefined, true, `Branch ${branch} should be included`)
    })

    // Verify bugfix/login is not included
    assertEquals(result.gitCommitsAllLocalBranches["bugfix/login"], undefined)
  })

  await t.step("should pass commit limit to getCommits when specified", async () => {
    setupMocks()

    const branches = ["main", "develop"]
    const branchesMap = new Map([
      ["main", { ref: "origin/main" }],
      ["develop", { ref: "origin/develop" }],
    ])
    const mockCommits: GitCommit[] = [createMockCommit()]
    const commitLimit = 100

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branchesMap))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve(mockCommits))

    await convenience.runConvenienceCommands([], commitLimit)

    // Verify getCommits was called with the commit limit
    const getCommitsCalls = (mockGit.getCommits as unknown as {
      calls: { args: [{ branch: { ref: string }; limit?: number }] }[]
    }).calls
    assertEquals(getCommitsCalls.length, branches.length)

    // Check that each call includes the commit limit in the args object
    getCommitsCalls.forEach((call) => {
      assertEquals(call.args[0].limit, commitLimit, "getCommits should be called with the specified commit limit")
    })
  })

  await t.step("should pass undefined commit limit when not specified", async () => {
    setupMocks()

    const branches = ["main"]
    const branchesMap = new Map([["main", { ref: "origin/main" }]])
    const mockCommits: GitCommit[] = [createMockCommit()]

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branchesMap))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve(mockCommits))

    await convenience.runConvenienceCommands([])

    // Verify getCommits was called without a commit limit
    const getCommitsCalls = (mockGit.getCommits as unknown as {
      calls: { args: [{ branch: { ref: string }; limit?: number }] }[]
    }).calls
    assertEquals(getCommitsCalls.length, branches.length)

    // Check that the call doesn't include a commit limit (should be undefined)
    getCommitsCalls.forEach((call) => {
      assertEquals(call.args[0].limit, undefined, "getCommits should be called without commit limit when not specified")
    })
  })
})
