import { assertEquals } from "@std/assert"
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd"
import { restore, stub } from "@std/testing/mock"
import { GetCommitsSinceLatestReleaseStepImpl } from "./get-commits-since-latest-release.ts"
import { GetLatestReleaseStepOutputFake } from "./types/output.test.ts"
import { mock } from "../mock/mock.ts"
import { Git } from "../git.ts"
import { GitCommitFake } from "../types/git.test.ts"

describe("getAllCommitsSinceGivenCommit", () => {
  let git: Git = mock()

  beforeEach(() => {
    git = mock()
  })

  afterEach(() => {
    restore()
  })

  it("given no commits, expect empty array", async () => {
    stub(git, "getCommits", async () => {
      return []
    })

    assertEquals(
      await new GetCommitsSinceLatestReleaseStepImpl(git)
        .getAllCommitsSinceGivenCommit({
          owner: "owner",
          repo: "repo",
          branch: "branch",
          latestRelease: GetLatestReleaseStepOutputFake,
        }),
      [],
    )
  })

  it("given multiple pages of commits, expect get expected set of commits", async () => {
    const givenLastTagSha = "sha-E"

    stub(git, "getCommits", async () => {
      return [
        new GitCommitFake({ sha: "sha-A", message: "", date: new Date(6) }),
        new GitCommitFake({ sha: "sha-B", message: "", date: new Date(5) }),
        new GitCommitFake({ sha: "sha-C", message: "", date: new Date(4) }),
        new GitCommitFake({ sha: "sha-D", message: "", date: new Date(3) }),
        new GitCommitFake({ sha: "sha-E", message: "", date: new Date(2) }),
        new GitCommitFake({ sha: "sha-F", message: "", date: new Date(1) }),
      ]
    })

    assertEquals(
      await new GetCommitsSinceLatestReleaseStepImpl(git)
        .getAllCommitsSinceGivenCommit({
          owner: "owner",
          repo: "repo",
          branch: "branch",
          latestRelease: {
            ...GetLatestReleaseStepOutputFake,
            commitSha: givenLastTagSha,
          },
        }),
      [
        new GitCommitFake({ sha: "sha-A", message: "", date: new Date(6) }),
        new GitCommitFake({ sha: "sha-B", message: "", date: new Date(5) }),
        new GitCommitFake({ sha: "sha-C", message: "", date: new Date(4) }),
        new GitCommitFake({ sha: "sha-D", message: "", date: new Date(3) }),
      ],
    )
  })
})
