import { assertEquals } from "@std/assert"
import { ConvenienceStepImpl } from "./convenience.ts"
import { mock, when } from "../mock/mock.ts"
import { Exec } from "../exec.ts"
import { Environment } from "../environment.ts"
import { logger } from "../log.ts"
import { Git } from "../git.ts"
import { GitCommit } from "../types/git.ts"
import { GitCommitFake } from "../types/git.test.ts"

Deno.test("ConvenienceStepImpl", async (t) => {
  let mockExec: Exec
  let mockEnvironment: Environment
  let mockGit: Git
  let convenience: ConvenienceStepImpl

  function setupMocks() {
    mockExec = mock<Exec>()
    mockEnvironment = mock<Environment>()
    mockGit = mock<Git>()

    // Mock exec.run method
    when(mockExec, "run", () => Promise.resolve({ exitCode: 0, stdout: "", output: undefined }))

    // Mock environment methods
    when(mockEnvironment, "getCommitLimit", () => 500)

    convenience = new ConvenienceStepImpl(mockExec, mockEnvironment, mockGit, logger)
  }

  const createMockCommit = (): GitCommit => new GitCommitFake({})

  await t.step("should set git config when user provides git committer config", async () => {
    setupMocks()

    const gitConfig = { name: "Test User", email: "test@example.com" }
    when(mockEnvironment, "getGitConfigInput", () => gitConfig)
    when(mockGit, "getBranches", () => Promise.resolve(["main"]))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve([]))

    await convenience.runConvenienceCommands()

    const execCalls = (mockExec.run as unknown as { calls: { args: [{ command: string }] }[] }).calls
    const userNameCall = execCalls.find((call) => call.args[0].command === `git config user.name "Test User"`)
    const userEmailCall = execCalls.find((call) => call.args[0].command === `git config user.email "test@example.com"`)

    assertEquals(userNameCall !== undefined, true, "git config user.name should be executed")
    assertEquals(userEmailCall !== undefined, true, "git config user.email should be executed")
  })

  await t.step("should not set git config when user does not provide git committer config", async () => {
    setupMocks()

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(["main"]))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve([]))

    await convenience.runConvenienceCommands()

    const execCalls = (mockExec.run as unknown as { calls: { args: [{ command: string }] }[] }).calls
    const gitConfigCalls = execCalls.filter((call) => call.args[0].command.includes("git config user."))

    assertEquals(gitConfigCalls.length, 0, "no git config commands should be executed")
  })

  await t.step("should get commits for all local branches when no filters provided", async () => {
    setupMocks()

    const branches = ["main", "feature", "develop"]
    const mockCommits: GitCommit[] = [createMockCommit()]

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branches))
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

    const branches = ["main", "feature/test", "hotfix/urgent", "develop"]
    const mockCommits: GitCommit[] = [createMockCommit()]

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branches))
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

    const branches = ["main", "feature/test", "develop"]
    const mockCommits: GitCommit[] = [createMockCommit()]

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branches))
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
    when(mockGit, "getBranches", () => Promise.resolve([]))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))

    const result = await convenience.runConvenienceCommands()

    assertEquals(Object.keys(result.gitCommitsAllLocalBranches).length, 0)
    assertEquals(result.gitCommitsCurrentBranch, undefined)
  })

  await t.step("should handle glob patterns in branch filters", async () => {
    setupMocks()

    const branches = ["main", "release/v1.0", "release/v2.0", "feature/auth", "bugfix/login"]
    const mockCommits: GitCommit[] = [createMockCommit()]

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branches))
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
    const mockCommits: GitCommit[] = [createMockCommit()]
    const commitLimit = 100

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branches))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve(mockCommits))

    await convenience.runConvenienceCommands([], commitLimit)

    // Verify getCommits was called with the commit limit
    const getCommitsCalls = (mockGit.getCommits as unknown as { calls: { args: [{ exec: unknown; branch: string; limit: number }] }[] }).calls
    assertEquals(getCommitsCalls.length, branches.length)

    // Check that each call includes the commit limit
    getCommitsCalls.forEach((call) => {
      assertEquals(call.args[0].limit, commitLimit, "getCommits should be called with the specified commit limit")
    })
  })

  await t.step("should pass undefined commit limit when not specified", async () => {
    setupMocks()

    const branches = ["main"]
    const mockCommits: GitCommit[] = [createMockCommit()]

    when(mockEnvironment, "getGitConfigInput", () => undefined)
    when(mockGit, "getBranches", () => Promise.resolve(branches))
    when(mockGit, "getCurrentBranch", () => Promise.resolve("main"))
    when(mockGit, "getCommits", () => Promise.resolve(mockCommits))

    await convenience.runConvenienceCommands([])

    // Verify getCommits was called without a commit limit
    const getCommitsCalls = (mockGit.getCommits as unknown as { calls: { args: [{ exec: unknown; branch: string; limit?: number }] }[] }).calls
    assertEquals(getCommitsCalls.length, branches.length)

    // Check that the call doesn't include a commit limit (should be undefined)
    getCommitsCalls.forEach((call) => {
      assertEquals(call.args[0].limit, undefined, "getCommits should be called without commit limit when not specified")
    })
  })
})
