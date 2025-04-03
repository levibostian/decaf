import { assertEquals } from "@std/assert"
import { versionBumpForCommitBasedOnConventionalCommit } from "./conventional-commits.ts"
import { GitHubCommit } from "./github-api.ts"

Deno.test("versionBumpForCommit returns 'major' for breaking changes", () => {
  const commit: GitHubCommit = {
    sha: "",
    message: "refactor!: drop support for Node 6",
    date: new Date(),
  }
  assertEquals(versionBumpForCommitBasedOnConventionalCommit(commit), "major")
})

Deno.test("versionBumpForCommit returns 'minor' for new features", () => {
  const commit: GitHubCommit = {
    sha: "",
    message: "feat: add support for TypeScript",
    date: new Date(),
  }
  assertEquals(versionBumpForCommitBasedOnConventionalCommit(commit), "minor")
})

Deno.test("versionBumpForCommit returns 'patch' for fixes", () => {
  const commit: GitHubCommit = {
    sha: "",
    message: "fix: correct minor typos in code",
    date: new Date(),
  }
  assertEquals(versionBumpForCommitBasedOnConventionalCommit(commit), "patch")
})

Deno.test("versionBumpForCommit returns undefined for non-conventional commits", () => {
  const commit: GitHubCommit = {
    sha: "",
    message: "Update README.md",
    date: new Date(),
  }
  assertEquals(
    versionBumpForCommitBasedOnConventionalCommit(commit),
    undefined,
  )
})

Deno.test("versionBumpForCommit returns undefined for new features with uppercase 'FEAT:'", () => {
  const commit: GitHubCommit = {
    sha: "",
    message: "FEAT: implement dark mode",
    date: new Date(),
  }
  assertEquals(
    versionBumpForCommitBasedOnConventionalCommit(commit),
    undefined,
  )
})

Deno.test("versionBumpForCommit returns undefined for fixes with mixed case 'Fix:'", () => {
  const commit: GitHubCommit = {
    sha: "",
    message: "Fix: address performance issue in data processing",
    date: new Date(),
  }
  assertEquals(
    versionBumpForCommitBasedOnConventionalCommit(commit),
    undefined,
  )
})

Deno.test("versionBumpForCommit handles commits with no colon after type", () => {
  const commit: GitHubCommit = {
    sha: "",
    message: "feat implement a new search algorithm",
    date: new Date(),
  }
  assertEquals(
    versionBumpForCommitBasedOnConventionalCommit(commit),
    undefined,
  )
})

Deno.test("versionBumpForCommit undefined when fix is incorrect format", () => {
  const commit: GitHubCommit = {
    sha: "",
    message: "fix : incorrect user input validation",
    date: new Date(),
  }
  assertEquals(
    versionBumpForCommitBasedOnConventionalCommit(commit),
    undefined,
  )
})

// Order matters

Deno.test("versionBumpForCommit returns 'major' for 'feat!:' indicating a breaking new feature", () => {
  const commit: GitHubCommit = {
    sha: "",
    message: "feat!: completely redesign UI",
    date: new Date(),
  }
  assertEquals(versionBumpForCommitBasedOnConventionalCommit(commit), "major")
})

Deno.test("versionBumpForCommit processes only the first line of a multi-line commit message", () => {
  const commit: GitHubCommit = {
    sha: "",
    message: `feat: add new authentication method
      This commit adds a new authentication method to the system.
      It includes changes to the login flow and user session management.`,
    date: new Date(),
  }
  assertEquals(versionBumpForCommitBasedOnConventionalCommit(commit), "minor")
})
