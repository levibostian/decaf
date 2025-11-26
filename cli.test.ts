import { assertEquals } from "@std/assert"
import { processCommandLineArgs } from "./cli.ts"

Deno.test("processCommandLineArgs - single deploy value", () => {
  processCommandLineArgs(["--deploy=production"])

  assertEquals(Deno.env.get("INPUT_DEPLOY"), "production")
})

Deno.test("processCommandLineArgs - multiple deploy values", () => {
  processCommandLineArgs([
    "--deploy=staging",
    "--deploy=production",
    "--deploy=qa",
  ])

  assertEquals(Deno.env.get("INPUT_DEPLOY"), "staging\nproduction\nqa")
})

Deno.test("processCommandLineArgs - no deploy values defaults to empty string", () => {
  processCommandLineArgs([])

  assertEquals(Deno.env.get("INPUT_DEPLOY"), "")
})

Deno.test("processCommandLineArgs - single get_latest_release_current_branch value", () => {
  processCommandLineArgs(["--get_latest_release_current_branch=main"])

  assertEquals(Deno.env.get("INPUT_GET_LATEST_RELEASE_CURRENT_BRANCH"), "main")
})

Deno.test("processCommandLineArgs - multiple get_latest_release_current_branch values", () => {
  processCommandLineArgs([
    "--get_latest_release_current_branch=main",
    "--get_latest_release_current_branch=develop",
  ])

  assertEquals(Deno.env.get("INPUT_GET_LATEST_RELEASE_CURRENT_BRANCH"), "main\ndevelop")
})

Deno.test("processCommandLineArgs - single get_next_release_version value", () => {
  processCommandLineArgs(["--get_next_release_version=1.0.0"])

  assertEquals(Deno.env.get("INPUT_GET_NEXT_RELEASE_VERSION"), "1.0.0")
})

Deno.test("processCommandLineArgs - multiple get_next_release_version values", () => {
  processCommandLineArgs([
    "--get_next_release_version=1.0.0",
    "--get_next_release_version=2.0.0",
    "--get_next_release_version=3.0.0",
  ])

  assertEquals(Deno.env.get("INPUT_GET_NEXT_RELEASE_VERSION"), "1.0.0\n2.0.0\n3.0.0")
})

Deno.test("processCommandLineArgs - mixed repeatable and single flags", () => {
  processCommandLineArgs([
    "--deploy=staging",
    "--deploy=production",
    "--github_token=test_token_123",
    "--simulated_merge_type=squash",
  ])

  assertEquals(Deno.env.get("INPUT_DEPLOY"), "staging\nproduction")
  assertEquals(Deno.env.get("INPUT_GITHUB_TOKEN"), "test_token_123")
  assertEquals(Deno.env.get("INPUT_SIMULATED_MERGE_TYPE"), "squash")
})
