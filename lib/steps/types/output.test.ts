import { GetLatestReleaseStepOutput, isGetLatestReleaseStepOutput } from "./output.ts"
import { assert, assertFalse } from "@std/assert"

export const GetLatestReleaseStepOutputFake: GetLatestReleaseStepOutput = {
  versionName: "v1.0.0",
  commitSha: "abc123",
}

// isGetLatestReleaseStepOutput
Deno.test("isGetLatestReleaseStepOutput - given empty object, expect false", () => {
  assertFalse(isGetLatestReleaseStepOutput({}))
})

Deno.test("isGetLatestReleaseStepOutput - given valid object, expect true", () => {
  assert(isGetLatestReleaseStepOutput({
    versionName: "v2.1.3",
    commitSha: "def456",
  }))
})

Deno.test("isGetLatestReleaseStepOutput - given object missing versionName, expect false", () => {
  assertFalse(isGetLatestReleaseStepOutput({ commitSha: "abc123" }))
})

Deno.test("isGetLatestReleaseStepOutput - given object missing commitSha, expect false", () => {
  assertFalse(isGetLatestReleaseStepOutput({ versionName: "v1.0.0" }))
})

Deno.test("isGetLatestReleaseStepOutput - given object with wrong types, expect false", () => {
  assertFalse(isGetLatestReleaseStepOutput({ versionName: 123, commitSha: {} }))
})

Deno.test("isGetLatestReleaseStepOutput - given null input, expect false", () => {
  assertFalse(isGetLatestReleaseStepOutput(null))
})

Deno.test("isGetLatestReleaseStepOutput returns false for undefined", () => {
  assert(!isGetLatestReleaseStepOutput(undefined))
})

Deno.test("isGetLatestReleaseStepOutput - given array input, expect false", () => {
  assertFalse(isGetLatestReleaseStepOutput([]))
})

Deno.test("isGetLatestReleaseStepOutput - given object with extra properties, expect true", () => {
  assert(isGetLatestReleaseStepOutput({ versionName: "v1.2.3", commitSha: "xyz789", extra: 42 }))
})
