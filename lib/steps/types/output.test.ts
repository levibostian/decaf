import {
  GetLatestReleaseStepOutput,
  GetNextReleaseVersionStepOutput,
  isGetLatestReleaseStepOutput,
  isGetNextReleaseVersionStepOutput,
} from "./output.ts"
import { assert, assertFalse } from "@std/assert"

export const GetLatestReleaseStepOutputFake: GetLatestReleaseStepOutput = {
  versionName: "v1.0.0",
  commitSha: "abc123",
}

export const GetNextReleaseVersionStepOutputFake: GetNextReleaseVersionStepOutput = {
  version: "2.1.0",
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

// isGetNextReleaseVersionStepOutput
Deno.test("isGetNextReleaseVersionStepOutput - given empty object, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput({}))
})

Deno.test("isGetNextReleaseVersionStepOutput - given valid object, expect true", () => {
  assert(isGetNextReleaseVersionStepOutput({
    version: "2.1.3",
  }))
})

Deno.test("isGetNextReleaseVersionStepOutput - given object missing version, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput({ otherProperty: "value" }))
})

Deno.test("isGetNextReleaseVersionStepOutput - given object with wrong version type, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput({ version: 123 }))
})

Deno.test("isGetNextReleaseVersionStepOutput - given object with version as object, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput({ version: { major: 1, minor: 2, patch: 3 } }))
})

Deno.test("isGetNextReleaseVersionStepOutput - given object with version as array, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput({ version: ["1", "2", "3"] }))
})

Deno.test("isGetNextReleaseVersionStepOutput - given object with version as boolean, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput({ version: true }))
})

Deno.test("isGetNextReleaseVersionStepOutput - given null input, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput(null))
})

Deno.test("isGetNextReleaseVersionStepOutput - given undefined input, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput(undefined))
})

Deno.test("isGetNextReleaseVersionStepOutput - given array input, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput([]))
})

Deno.test("isGetNextReleaseVersionStepOutput - given string input, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput("1.2.3"))
})

Deno.test("isGetNextReleaseVersionStepOutput - given number input, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput(123))
})

Deno.test("isGetNextReleaseVersionStepOutput - given boolean input, expect false", () => {
  assertFalse(isGetNextReleaseVersionStepOutput(true))
})

Deno.test("isGetNextReleaseVersionStepOutput - given object with extra properties, expect true", () => {
  assert(isGetNextReleaseVersionStepOutput({
    version: "1.2.3",
    extra: 42,
    anotherProperty: "value",
  }))
})

Deno.test("isGetNextReleaseVersionStepOutput - given object with empty version string, expect true", () => {
  assert(isGetNextReleaseVersionStepOutput({ version: "" }))
})

Deno.test("isGetNextReleaseVersionStepOutput - given object with semantic version, expect true", () => {
  assert(isGetNextReleaseVersionStepOutput({ version: "1.2.3-alpha.1+build.123" }))
})

Deno.test("isGetNextReleaseVersionStepOutput - given object with version containing whitespace, expect true", () => {
  assert(isGetNextReleaseVersionStepOutput({ version: "  1.2.3  " }))
})
