import { assertEquals, assertRejects } from "@std/assert"
import { isGitHubRemoteScript, parseGitHubRemoteScript } from "./github-remote-script.ts"

Deno.test("isGitHubRemoteScript detects valid GitHub URLs", () => {
  assertEquals(isGitHubRemoteScript("github.com/owner/repo/script.ts@main"), true)
  assertEquals(isGitHubRemoteScript("  github.com/owner/repo/script.ts@main  "), true)
  assertEquals(isGitHubRemoteScript("github.com/owner/repo/path/to/script.sh@v1.0.0"), true)
})

Deno.test("isGitHubRemoteScript rejects non-GitHub URLs", () => {
  assertEquals(isGitHubRemoteScript("deno run script.ts"), false)
  assertEquals(isGitHubRemoteScript("https://github.com/owner/repo/script.ts"), false)
  assertEquals(isGitHubRemoteScript("echo hello"), false)
  assertEquals(isGitHubRemoteScript("git clone github.com/owner/repo"), false)
})

Deno.test("parseGitHubRemoteScript parses basic URL", () => {
  const result = parseGitHubRemoteScript("github.com/owner/repo/script.ts@main")

  assertEquals(result.owner, "owner")
  assertEquals(result.repo, "repo")
  assertEquals(result.path, "script.ts")
  assertEquals(result.ref, "main")
  assertEquals(result.args, [])
})

Deno.test("parseGitHubRemoteScript parses URL with nested path", () => {
  const result = parseGitHubRemoteScript("github.com/foo/bar/path/to/scripts/deploy.sh@v1.0.0")

  assertEquals(result.owner, "foo")
  assertEquals(result.repo, "bar")
  assertEquals(result.path, "path/to/scripts/deploy.sh")
  assertEquals(result.ref, "v1.0.0")
  assertEquals(result.args, [])
})

Deno.test("parseGitHubRemoteScript parses URL with commit hash", () => {
  const result = parseGitHubRemoteScript("github.com/owner/repo/script.ts@abc123def456")

  assertEquals(result.owner, "owner")
  assertEquals(result.repo, "repo")
  assertEquals(result.path, "script.ts")
  assertEquals(result.ref, "abc123def456")
  assertEquals(result.args, [])
})

Deno.test("parseGitHubRemoteScript parses URL with single argument", () => {
  const result = parseGitHubRemoteScript("github.com/owner/repo/script.ts@main arg1")

  assertEquals(result.owner, "owner")
  assertEquals(result.repo, "repo")
  assertEquals(result.path, "script.ts")
  assertEquals(result.ref, "main")
  assertEquals(result.args, ["arg1"])
})

Deno.test("parseGitHubRemoteScript parses URL with multiple arguments", () => {
  const result = parseGitHubRemoteScript("github.com/owner/repo/script.ts@main arg1 arg2 arg3")

  assertEquals(result.owner, "owner")
  assertEquals(result.repo, "repo")
  assertEquals(result.path, "script.ts")
  assertEquals(result.ref, "main")
  assertEquals(result.args, ["arg1", "arg2", "arg3"])
})

Deno.test("parseGitHubRemoteScript handles extra whitespace", () => {
  const result = parseGitHubRemoteScript("  github.com/owner/repo/script.ts@main   arg1   arg2  ")

  assertEquals(result.owner, "owner")
  assertEquals(result.repo, "repo")
  assertEquals(result.path, "script.ts")
  assertEquals(result.ref, "main")
  assertEquals(result.args, ["arg1", "arg2"])
})

Deno.test("parseGitHubRemoteScript throws on missing github.com prefix", () => {
  assertRejects(
    async () => parseGitHubRemoteScript("owner/repo/script.ts@main"),
    Error,
    "GitHub URL must start with github.com/",
  )
})

Deno.test("parseGitHubRemoteScript throws on missing @ref", () => {
  assertRejects(
    async () => parseGitHubRemoteScript("github.com/owner/repo/script.ts"),
    Error,
    "GitHub URL must include @ref",
  )
})

Deno.test("parseGitHubRemoteScript throws on empty ref", () => {
  assertRejects(
    async () => parseGitHubRemoteScript("github.com/owner/repo/script.ts@"),
    Error,
    "Git reference cannot be empty after @",
  )
})

Deno.test("parseGitHubRemoteScript throws on missing owner", () => {
  assertRejects(
    async () => parseGitHubRemoteScript("github.com/@main"),
    Error,
    "GitHub URL must include owner, repo, and file path",
  )
})

Deno.test("parseGitHubRemoteScript throws on missing repo", () => {
  assertRejects(
    async () => parseGitHubRemoteScript("github.com/owner/@main"),
    Error,
    "GitHub URL must include owner, repo, and file path",
  )
})

Deno.test("parseGitHubRemoteScript throws on missing path", () => {
  assertRejects(
    async () => parseGitHubRemoteScript("github.com/owner/repo@main"),
    Error,
    "GitHub URL must include owner, repo, and file path",
  )
})

Deno.test("parseGitHubRemoteScript handles URL with dashes and underscores", () => {
  const result = parseGitHubRemoteScript("github.com/my-org/my_repo/my-script_v2.ts@feature/my-branch")

  assertEquals(result.owner, "my-org")
  assertEquals(result.repo, "my_repo")
  assertEquals(result.path, "my-script_v2.ts")
  assertEquals(result.ref, "feature/my-branch")
  assertEquals(result.args, [])
})

Deno.test("parseGitHubRemoteScript handles arguments with special characters", () => {
  const result = parseGitHubRemoteScript('github.com/owner/repo/script.ts@main --flag=value "arg with spaces"')

  assertEquals(result.owner, "owner")
  assertEquals(result.repo, "repo")
  assertEquals(result.path, "script.ts")
  assertEquals(result.ref, "main")
  assertEquals(result.args, ["--flag=value", '"arg', "with", 'spaces"'])
})
