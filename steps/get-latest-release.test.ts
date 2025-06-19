// Integration test for get-latest-release.ts script
// This test runs the script as a subprocess, passing real input and checking the output.
// It uses a real public GitHub repository.

/**
 * Running these tests:
 * 1. You can run the script directly by providing a GitHub token in the environment variable `INPUT_GITHUB_TOKEN`.
 * 2. The test functions in here provide mock data to simulate the behavior of the script.
 */

import { assertEquals } from "@std/assert"

async function runGetLatestReleaseScript(input: Record<string, unknown>) {
  // Write input to a temp file
  const tempFile = await Deno.makeTempFile()
  const inputFileContents = JSON.stringify(input)
  await Deno.writeTextFile(tempFile, inputFileContents)

  // Get absolute path to get-latest-release.ts
  const scriptPath = new URL("./get-latest-release.ts", import.meta.url).pathname

  const process = new Deno.Command("deno", {
    args: ["run", "--allow-all", scriptPath],
    env: { INPUT_GITHUB_TOKEN: "", DATA_FILE_PATH: tempFile, ...Deno.env.toObject() },
  })

  const child = process.spawn()
  const code = (await child.status).code
  let outputFileContents = await Deno.readTextFile(tempFile)
  if (outputFileContents == inputFileContents) {
    outputFileContents = ""
  }

  return { code, outputFileContents, inputFileContents }
}

Deno.test("finds the latest release for a real public repo branch", async () => {
  const input = {
    sampleData: {
      getCommitsForBranch: [
        {
          sha: "d4e5f6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3",
          message: "commit 1",
          date: new Date("2023-09-15T00:00:00Z"),
        },
        {
          sha: "cbfc0822045e9f1d07838a6db9e71a46d50ca2da",
          message: "commit 2",
          date: new Date("2023-10-01T00:00:00Z"),
        },
        {
          sha: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
          message: "commit 3",
          date: new Date("2023-11-20T00:00:00Z"),
        },
      ],
      getTagsWithGitHubReleases: [
        {
          tag: {
            name: "v1.0.0",
            commit: {
              sha: "cbfc0822045e9f1d07838a6db9e71a46d50ca2da",
            },
          },
          name: "v1.0.0",
          created_at: new Date("2023-10-01T00:00:00Z"),
        },
      ],
    },
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runGetLatestReleaseScript(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"versionName":"v1.0.0","commitSha":"cbfc0822045e9f1d07838a6db9e71a46d50ca2da"}`)
})

Deno.test("given branch with no commits, expect null", async () => {
  // Using an archived repo to avoid the version name ever changing.
  const input = {
    sampleData: {
      getCommitsForBranch: [],
      getTagsWithGitHubReleases: [],
    },
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runGetLatestReleaseScript(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, "")
})

Deno.test("given branch with no release, expect null", async () => {
  // Using an archived repo to avoid the version name ever changing.
  const input = {
    sampleData: {
      getCommitsForBranch: [
        {
          sha: "cbfc0822045e9f1d07838a6db9e71a46d50ca2da",
          message: "chore: does not trigger a release",
          date: new Date("2023-10-01T00:00:00Z"),
        },
      ],
      getTagsWithGitHubReleases: [],
    },
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runGetLatestReleaseScript(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, "")
})
