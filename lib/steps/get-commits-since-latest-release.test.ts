import { assertEquals } from "@std/assert"
import { afterEach, describe, it } from "@std/testing/bdd"
import { restore, stub } from "@std/testing/mock"
import { GetCommitsSinceLatestReleaseStepImpl } from "./get-commits-since-latest-release.ts"
import { GitHubReleaseFake } from "../github-api.test.ts"
import { git } from "../git.ts"
import { exec } from "../exec.ts"

describe("getAllCommitsSinceGivenCommit", () => {
  afterEach(() => {
    restore()
  })

  it("given no commits, expect empty array", async () => {
    stub(git, "getLatestCommitsSince", async () => {
      return []
    })

    assertEquals(
      await new GetCommitsSinceLatestReleaseStepImpl(git, exec)
        .getAllCommitsSinceGivenCommit({
          latestRelease: GitHubReleaseFake,
        }),
      [],
    )
  })

  it("given list of commits that contains latest, expect get expected set of commits", async () => {
    const givenLastTagSha = "sha-E"

    stub(git, "getLatestCommitsSince", async () => {
      return [
        { sha: "sha-A", message: "", date: new Date(6) },
        { sha: "sha-B", message: "", date: new Date(5) },
        { sha: "sha-C", message: "", date: new Date(4) },
        { sha: "sha-D", message: "", date: new Date(3) },
        { sha: "sha-E", message: "", date: new Date(2) },
        { sha: "sha-F", message: "", date: new Date(1) },
      ]
    })

    assertEquals(
      await new GetCommitsSinceLatestReleaseStepImpl(git, exec)
        .getAllCommitsSinceGivenCommit({
          latestRelease: {
            ...GitHubReleaseFake,
            tag: { name: "", commit: { sha: givenLastTagSha } },
          },
        }),
      [
        { sha: "sha-A", message: "", date: new Date(6) },
        { sha: "sha-B", message: "", date: new Date(5) },
        { sha: "sha-C", message: "", date: new Date(4) },
        { sha: "sha-D", message: "", date: new Date(3) },
      ],
    )
  })

  it("given list of commits that does not contain latest, expect get empty array", async () => {
    const givenLastTagSha = "sha-1"

    stub(git, "getLatestCommitsSince", async () => {
      return [
        { sha: "sha-A", message: "", date: new Date(6) },
        { sha: "sha-B", message: "", date: new Date(5) },
        { sha: "sha-C", message: "", date: new Date(4) },
      ]
    })

    assertEquals(
      await new GetCommitsSinceLatestReleaseStepImpl(git, exec)
        .getAllCommitsSinceGivenCommit({
          latestRelease: {
            ...GitHubReleaseFake,
            tag: { name: "", commit: { sha: givenLastTagSha } },
          },
        }),
      [],
    )
  })
})
