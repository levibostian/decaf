import { assertEquals, assertRejects } from "@std/assert"
import { afterEach, describe, it } from "@std/testing/bdd"
import { assertSpyCall, restore, stub } from "@std/testing/mock"
import { exec } from "./exec.ts"
import { git } from "./git.ts"
import { GitCommit } from "./types/git.ts"

describe("checkoutBranch", () => {
  afterEach(() => {
    restore()
  })

  it("should execute the expected command", async () => {
    const execMock = stub(exec, "run", async (args) => {
      return { exitCode: 0, stdout: "success", output: undefined }
    })

    await git.checkoutBranch({ exec, branch: "main", createBranchIfNotExist: false })

    assertSpyCall(execMock, 0, {
      args: [{ command: `git checkout main`, input: undefined }],
    })

    // Now, test with createBranchIfNotExist
    await git.checkoutBranch({ exec, branch: "main", createBranchIfNotExist: true })

    assertSpyCall(execMock, 1, {
      args: [{ command: `git checkout -b main`, input: undefined }],
    })
  })

  it("should throw an error, given the command fails", async () => {
    stub(exec, "run", async (args) => {
      throw new Error("error")
    })

    assertRejects(async () => {
      await git.checkoutBranch({ exec, branch: "main", createBranchIfNotExist: false })
    }, Error)
  })
})

describe("createLocalBranchFromRemote", () => {
  afterEach(() => {
    restore()
  })

  it("should execute the expected commands, given a branch", async () => {
    const execMock = stub(exec, "run", async (args) => {
      if (args.command.includes("--show-current")) {
        return { exitCode: 0, stdout: "branch-im-on", output: undefined }
      }

      return { exitCode: 0, stdout: "", output: undefined }
    })

    await git.createLocalBranchFromRemote({ exec, branch: "branch-to-pull" })

    assertEquals(execMock.calls.map((call) => call.args[0].command), [
      "git branch --show-current",
      "git branch --list branch-to-pull",
      "git fetch origin",
      "git branch --track branch-to-pull origin/branch-to-pull",
      "git checkout branch-to-pull",
      "git pull --no-rebase origin branch-to-pull",
      "git checkout branch-im-on",
    ])
  })

  it("should throw an error, given a command fails", async () => {
    stub(exec, "run", async (args) => {
      throw new Error("")
    })

    assertRejects(async () => {
      await git.createLocalBranchFromRemote({ exec, branch: "main" })
    }, Error)
  })
})

const setupExecMock = (stdout: string) => {
  restore() // Reset any existing mocks before creating a new one
  stub(exec, "run", async (args) => {
    return { exitCode: 0, stdout, output: undefined }
  })
}

const assertCommit = (commit: GitCommit, expected: Partial<GitCommit>) => {
  for (const [key, value] of Object.entries(expected)) {
    assertEquals(commit[key as keyof GitCommit], value, `Expected ${key} to match`)
  }
}

const assertFirstCommit = (result: GitCommit[], expected: Partial<GitCommit>) => {
  assertEquals(result.length >= 1, true, "Expected at least one commit")
  assertCommit(result[0], expected)
}

Deno.test("getCommits - should parse merge commits", async () => {
  const gitLogOutput =
    `[[⬛]]abc1234567890123456789012345678901234567[⬛]Merge pull request #123 from feature/new-feature[⬛]Merge pull request #123 from feature/new-feature

This is a merge commit with multiple parents.[⬛]John Doe[⬛]john@example.com[⬛]GitHub[⬛]noreply@github.com[⬛]2023-10-15T10:30:00Z[⬛]parent1 parent2[⬛]HEAD -> main, origin/main
5	2	src/file1.ts
10	0	src/file2.ts`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    sha: "abc1234567890123456789012345678901234567",
    abbreviatedSha: "abc12345",
    title: "Merge pull request #123 from feature/new-feature",
    isMergeCommit: true,
    isRevertCommit: false,
    parents: ["parent1", "parent2"],
    filesChanged: ["src/file1.ts", "src/file2.ts"],
    stats: { additions: 15, deletions: 2, total: 17 },
    fileStats: [
      { filename: "src/file1.ts", additions: 5, deletions: 2 },
      { filename: "src/file2.ts", additions: 10, deletions: 0 },
    ],
  })
})

Deno.test("getCommits - should parse abbreviated SHA correctly", async () => {
  const gitLogOutput = `[[⬛]]abc1234567890123456789012345678901234567[⬛]feat: test abbreviated SHA[⬛]feat: test abbreviated SHA

Testing that abbreviated SHA is correctly extracted.[⬛]Test Author[⬛]test@example.com[⬛]Test Author[⬛]test@example.com[⬛]2023-10-15T10:30:00Z[⬛]parent1[⬛]main
1	0	test.ts`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    sha: "abc1234567890123456789012345678901234567",
    abbreviatedSha: "abc12345",
    title: "feat: test abbreviated SHA",
  })
})

Deno.test("getCommits - should parse revert commits", async () => {
  const gitLogOutput = `[[⬛]]def9876543210987654321098765432109876543[⬛]Revert "Add problematic feature"[⬛]Revert "Add problematic feature"

This reverts commit abc123.

The feature was causing issues in production.[⬛]Alice Smith[⬛]alice@example.com[⬛]Alice Smith[⬛]alice@example.com[⬛]2023-10-14T15:20:00Z[⬛]parent1[⬛]main
3	5	src/feature.ts`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    sha: "def9876543210987654321098765432109876543",
    abbreviatedSha: "def98765",
    isRevertCommit: true,
    isMergeCommit: false,
    title: 'Revert "Add problematic feature"',
    parents: ["parent1"],
    stats: { additions: 3, deletions: 5, total: 8 },
  })
})

Deno.test("getCommits - should parse commits with no file stats", async () => {
  const gitLogOutput = `[[⬛]]xyz1111111111111111111111111111111111111[⬛]Initial commit[⬛]Initial commit

This is the very first commit with no files changed.[⬛]Bob Wilson[⬛]bob@example.com[⬛]Bob Wilson[⬛]bob@example.com[⬛]2023-10-01T09:00:00Z[⬛] [⬛]main`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    filesChanged: [],
    stats: { additions: 0, deletions: 0, total: 0 },
    fileStats: [],
    parents: [],
    branch: "main",
  })
})

Deno.test("getCommits - should parse file stats with multiple files", async () => {
  const gitLogOutput = `[[⬛]]mno4444444444444444444444444444444444444[⬛]feat: implement user authentication[⬛]feat: implement user authentication

Added login, logout, and session management.
Includes unit tests and documentation.[⬛]Carol Davis[⬛]carol@example.com[⬛]Carol Davis[⬛]carol@example.com[⬛]2023-10-12T14:45:00Z[⬛]parent1[⬛]origin/main, main
25	0	src/auth/login.ts
15	3	src/auth/session.ts
40	0	tests/auth.test.ts
5	1	README.md
-	-	assets/logo.png`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    filesChanged: ["src/auth/login.ts", "src/auth/session.ts", "tests/auth.test.ts", "README.md", "assets/logo.png"],
    stats: { additions: 85, deletions: 4, total: 89 },
    fileStats: [
      { filename: "src/auth/login.ts", additions: 25, deletions: 0 },
      { filename: "src/auth/session.ts", additions: 15, deletions: 3 },
      { filename: "tests/auth.test.ts", additions: 40, deletions: 0 },
      { filename: "README.md", additions: 5, deletions: 1 },
      { filename: "assets/logo.png", additions: 0, deletions: 0 },
    ],
  })
})

Deno.test("getCommits - should parse commits with tags", async () => {
  const gitLogOutput = `[[⬛]]tag1111111111111111111111111111111111111[⬛]v2.1.0 release[⬛]v2.1.0 release

Release version 2.1.0 with new features and bug fixes.[⬛]Release Bot[⬛]release@example.com[⬛]Release Bot[⬛]release@example.com[⬛]2023-10-20T12:00:00Z[⬛]parent1[⬛]tag: v2.1.0, tag: v2.1.0-rc1, main
2	1	package.json
10	5	CHANGELOG.md`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    tags: ["v2.1.0", "v2.1.0-rc1"],
    branch: "main",
    refs: ["tag: v2.1.0", "tag: v2.1.0-rc1", "main"],
  })
})

Deno.test("getCommits - should parse commits with empty refs", async () => {
  const gitLogOutput = `[[⬛]]empty111111111111111111111111111111111111[⬛]fix: minor bug fix[⬛]fix: minor bug fix

Fixed a small issue in error handling.[⬛]Dev User[⬛]dev@example.com[⬛]Dev User[⬛]dev@example.com[⬛]2023-10-18T08:15:00Z[⬛]parent1[⬛]
1	1	src/error.ts`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    refs: [],
    tags: [],
    branch: undefined,
  })
})

Deno.test("getCommits - should parse multiple commits", async () => {
  const gitLogOutput = `[[⬛]]commit1111111111111111111111111111111111111[⬛]feat: add search functionality[⬛]feat: add search functionality

Implemented full-text search with indexing.[⬛]Alice Dev[⬛]alice@dev.com[⬛]Alice Dev[⬛]alice@dev.com[⬛]2023-10-25T16:30:00Z[⬛]parent1[⬛]main
50	10	src/search.ts
25	5	src/index.ts
[[⬛]]commit2222222222222222222222222222222222222[⬛]fix: resolve memory leak[⬛]fix: resolve memory leak

Fixed memory leak in event listeners.[⬛]Bob Dev[⬛]bob@dev.com[⬛]Bob Dev[⬛]bob@dev.com[⬛]2023-10-24T14:20:00Z[⬛]parent2[⬛]main
5	15	src/events.ts
3	0	src/cleanup.ts
[[⬛]]commit3333333333333333333333333333333333333[⬛]Merge pull request #456 from feature/auth[⬛]Merge pull request #456 from feature/auth

Merge authentication feature branch.[⬛]GitHub[⬛]noreply@github.com[⬛]GitHub[⬛]noreply@github.com[⬛]2023-10-23T12:00:00Z[⬛]merge1 merge2[⬛]HEAD -> main, origin/main
0	0	merge-file.txt
[[⬛]]commit4444444444444444444444444444444444444[⬛]Revert "Broken feature"[⬛]Revert "Broken feature"

This reverts commit broken123.[⬛]Carol Maintainer[⬛]carol@example.com[⬛]Carol Maintainer[⬛]carol@example.com[⬛]2023-10-22T09:15:00Z[⬛]parent4[⬛]tag: v1.2.0, main
10	20	src/revert.ts`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 4)

  // First commit - regular feature commit
  assertCommit(result[0], {
    sha: "commit1111111111111111111111111111111111111",
    title: "feat: add search functionality",
    author: { name: "Alice Dev", email: "alice@dev.com" },
    stats: { additions: 75, deletions: 15, total: 90 },
    isMergeCommit: false,
    isRevertCommit: false,
    filesChanged: ["src/search.ts", "src/index.ts"],
  })

  // Second commit - bug fix
  assertCommit(result[1], {
    sha: "commit2222222222222222222222222222222222222",
    title: "fix: resolve memory leak",
    author: { name: "Bob Dev", email: "bob@dev.com" },
    stats: { additions: 8, deletions: 15, total: 23 },
    isMergeCommit: false,
    isRevertCommit: false,
    parents: ["parent2"],
  })

  // Third commit - merge commit
  assertCommit(result[2], {
    sha: "commit3333333333333333333333333333333333333",
    title: "Merge pull request #456 from feature/auth",
    isMergeCommit: true,
    isRevertCommit: false,
    parents: ["merge1", "merge2"],
    refs: ["HEAD -> main", "origin/main"],
  })

  // Fourth commit - revert commit with tag
  assertCommit(result[3], {
    sha: "commit4444444444444444444444444444444444444",
    title: 'Revert "Broken feature"',
    isRevertCommit: true,
    isMergeCommit: false,
    tags: ["v1.2.0"],
    stats: { additions: 10, deletions: 20, total: 30 },
  })
})

Deno.test("getCommits - should handle binary files correctly", async () => {
  const gitLogOutput = `[[⬛]]binary11111111111111111111111111111111111[⬛]docs: add documentation images[⬛]docs: add documentation images

Added screenshots and diagrams for documentation.[⬛]Doc Writer[⬛]docs@example.com[⬛]Doc Writer[⬛]docs@example.com[⬛]2023-10-22T11:45:00Z[⬛]parent1[⬛]main
-	-	docs/screenshot1.png
-	-	docs/diagram.jpg
20	5	docs/setup.md
15	0	docs/usage.md`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    filesChanged: ["docs/screenshot1.png", "docs/diagram.jpg", "docs/setup.md", "docs/usage.md"],
    stats: { additions: 35, deletions: 5, total: 40 },
    fileStats: [
      { filename: "docs/screenshot1.png", additions: 0, deletions: 0 },
      { filename: "docs/diagram.jpg", additions: 0, deletions: 0 },
      { filename: "docs/setup.md", additions: 20, deletions: 5 },
      { filename: "docs/usage.md", additions: 15, deletions: 0 },
    ],
  })
})

Deno.test("getCommits - should parse commit with complex message", async () => {
  const gitLogOutput =
    `[[⬛]]complex111111111111111111111111111111111[⬛]refactor: restructure authentication module[⬛]refactor: restructure authentication module

This commit includes several changes:
- Moved auth logic to separate files
- Added better error handling
- Improved type safety
- Updated tests

Breaking changes:
- AuthService interface has changed
- Login method now returns Promise<User>

Fixes #123, #456
Co-authored-by: Jane Doe <jane@example.com>[⬛]Main Author[⬛]main@example.com[⬛]Main Author[⬛]main@example.com[⬛]2023-10-23T09:30:00Z[⬛]parent1[⬛]origin/feature-auth, feature-auth
30	45	src/auth/service.ts
20	10	src/auth/types.ts
15	5	tests/auth.test.ts`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    title: "refactor: restructure authentication module",
    branch: "feature-auth",
    refs: ["origin/feature-auth", "feature-auth"],
  })
  assertEquals(result[0].messageLines.length, 14) // Multiple lines in the message
  assertEquals(result[0].messageLines[0], "refactor: restructure authentication module")
  assertEquals(result[0].messageLines[1], "")
  assertEquals(result[0].messageLines[2], "This commit includes several changes:")
})

Deno.test("getCommits - should handle commits with HEAD reference", async () => {
  const gitLogOutput = `[[⬛]]head1111111111111111111111111111111111111[⬛]chore: update dependencies[⬛]chore: update dependencies

Updated all packages to latest versions.[⬛]Maintainer[⬛]maintainer@example.com[⬛]Maintainer[⬛]maintainer@example.com[⬛]2023-10-26T10:00:00Z[⬛]parent1[⬛]HEAD -> main, origin/main
5	3	package.json
100	50	package-lock.json`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    refs: ["HEAD -> main", "origin/main"],
    branch: "origin/main", // Should pick the first non-HEAD, non-tag ref
  })
})

Deno.test("getCommits - should return empty array for no commits", async () => {
  setupExecMock("")
  const result = await git.getCommits({ exec, branch: "empty-branch" })
  assertEquals(result, [])
})

Deno.test("getCommits - should handle commits with only deletions", async () => {
  const gitLogOutput = `[[⬛]]delete11111111111111111111111111111111111[⬛]remove: delete unused files[⬛]remove: delete unused files

Cleanup: removed old, unused files.[⬛]Cleaner[⬛]clean@example.com[⬛]Cleaner[⬛]clean@example.com[⬛]2023-10-27T13:15:00Z[⬛]parent1[⬛]main
0	50	old-file1.ts
0	25	old-file2.ts
0	10	deprecated.md`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    stats: { additions: 0, deletions: 85, total: 85 },
    fileStats: [
      { filename: "old-file1.ts", additions: 0, deletions: 50 },
      { filename: "old-file2.ts", additions: 0, deletions: 25 },
      { filename: "deprecated.md", additions: 0, deletions: 10 },
    ],
  })
})

Deno.test("getCommits - should parse dates correctly", async () => {
  const gitLogOutput = `[[⬛]]date1111111111111111111111111111111111111[⬛]test: verify date parsing[⬛]test: verify date parsing

Testing date parsing functionality.[⬛]Date Tester[⬛]date@example.com[⬛]Date Tester[⬛]date@example.com[⬛]2023-12-25T23:59:59Z[⬛]parent1[⬛]main
1	0	test.ts`

  setupExecMock(gitLogOutput)
  const result = await git.getCommits({ exec, branch: "main" })

  assertEquals(result.length, 1)
  assertFirstCommit(result, {
    date: new Date("2023-12-25T23:59:59Z"),
    author: { name: "Date Tester", email: "date@example.com" },
    committer: { name: "Date Tester", email: "date@example.com" },
  })
})

Deno.test("getCurrentBranch - should return the current branch name", async () => {
  setupExecMock("feature-branch")

  const result = await git.getCurrentBranch({ exec })

  assertEquals(result, "feature-branch")
})

Deno.test("getCurrentBranch - should handle whitespace in branch name", async () => {
  setupExecMock("  develop  \n")

  const result = await git.getCurrentBranch({ exec })

  assertEquals(result, "develop")
})

Deno.test("getLocalBranches - should return list of local branches", async () => {
  setupExecMock("main\nfeature-branch\ndevelop")

  const result = await git.getLocalBranches({ exec })

  assertEquals(result, ["main", "feature-branch", "develop"])
})

Deno.test("getLocalBranches - should return list of local and remote branches", async () => {
  setupExecMock("main\nfeature-branch\norigin/develop\norigin/hotfix")

  const result = await git.getLocalBranches({ exec })

  assertEquals(result, ["main", "feature-branch", "develop", "hotfix"])
})

Deno.test("getLocalBranches - should remove duplicates when same branch exists locally and remotely", async () => {
  setupExecMock("main\nfeature-branch\norigin/main\norigin/feature-branch\norigin/develop")

  const result = await git.getLocalBranches({ exec })

  assertEquals(result, ["main", "feature-branch", "develop"])
})

Deno.test("getLocalBranches - should filter out HEAD and origin references", async () => {
  setupExecMock("main\norigin/HEAD\norigin/main\nfeature-branch\norigin")

  const result = await git.getLocalBranches({ exec })

  assertEquals(result, ["main", "feature-branch"])
})

Deno.test("getLocalBranches - should handle only remote branches", async () => {
  setupExecMock("origin/main\norigin/develop\norigin/feature-auth")

  const result = await git.getLocalBranches({ exec })

  assertEquals(result, ["main", "develop", "feature-auth"])
})

Deno.test("getLocalBranches - should handle mixed local and remote branches with complex names", async () => {
  setupExecMock("main\nfeature/user-auth\norigin/main\norigin/hotfix/critical-bug\norigin/release/v2.0\nbugfix/memory-leak")

  const result = await git.getLocalBranches({ exec })

  assertEquals(result, ["main", "feature/user-auth", "hotfix/critical-bug", "release/v2.0", "bugfix/memory-leak"])
})

Deno.test("getLocalBranches - should handle single branch", async () => {
  setupExecMock("main")

  const result = await git.getLocalBranches({ exec })

  assertEquals(result, ["main"])
})

Deno.test("getLocalBranches - should handle empty repository with no branches", async () => {
  setupExecMock("")

  const result = await git.getLocalBranches({ exec })

  assertEquals(result, [])
})
