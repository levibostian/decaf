// Integration test for get-latest-release.ts script
// This test runs the script as a subprocess, passing real input and checking the output.
// It uses a real public GitHub repository.

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
  const outputFileContents = await Deno.readTextFile(tempFile)
  return { code, outputFileContents, inputFileContents }
}

Deno.test("finds the latest release for a real public repo branch", async () => {
  // Using an archived repo to avoid the version name ever changing.
  const input = {
    gitCurrentBranch: "master",
    gitRepoOwner: "levibostian",
    gitRepoName: "semantic-release-android-jcenter",
    testMode: false,
  }

  const { code, outputFileContents } = await runGetLatestReleaseScript(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"versionName":"v1.0.0","commitSha":"cbfc0822045e9f1d07838a6db9e71a46d50ca2da"}`)
})

Deno.test("given branch with no commits, expect null", async () => {
  // Using an archived repo to avoid the version name ever changing.
  const input = {
    gitCurrentBranch: "master",
    gitRepoOwner: "levibostian",
    gitRepoName: "ExpressjsBlanky",
    testMode: false,
  }

  const { code, outputFileContents, inputFileContents } = await runGetLatestReleaseScript(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, inputFileContents)
})
