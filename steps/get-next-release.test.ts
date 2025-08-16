import { assertEquals } from "@std/assert"
import { GitCommitFake } from "../lib/types/git.test.ts"

async function runStep(input: Record<string, unknown>, config?: Record<string, unknown>) {
  // Write input to a temp file
  const tempFile = await Deno.makeTempFile()
  const inputFileContents = JSON.stringify(input)
  await Deno.writeTextFile(tempFile, inputFileContents)

  // Get absolute path to get-next-release.ts
  const scriptPath = new URL("./get-next-release.ts", import.meta.url).pathname

  const process = new Deno.Command("deno", {
    args: ["run", "--allow-all", scriptPath, "--config", JSON.stringify(config || {})],
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

Deno.test("given no latest release, expect 0.1.0", async () => {
  // Using an archived repo to avoid the version name ever changing.
  const input = {
    lastRelease: null,
    gitCommitsSinceLastRelease: [
      new GitCommitFake({ sha: "1234567890", message: "feat: add new feature" }),
    ],
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"0.1.0"}`)
})

Deno.test("given introducing a breaking change from pre-1.0 version, expect 1.0.0", async () => {
  const input = {
    lastRelease: {
      versionName: "0.5.0",
    },
    gitCommitsSinceLastRelease: [
      new GitCommitFake({ sha: "1234567890", message: "feat!: add new authentication system" }),
    ],
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"1.0.0"}`)
})

Deno.test("given introducing a breaking change from post-1.0 version, expect bumps major version", async () => {
  const input = {
    lastRelease: {
      versionName: "1.5.2",
    },
    gitCommitsSinceLastRelease: [
      new GitCommitFake({ sha: "1234567890", message: "feat!: add new authentication system" }),
    ],
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"2.0.0"}`)
})

Deno.test("given a feature commit from pre-1.0 version, expect bumps minor version", async () => {
  const input = {
    lastRelease: {
      versionName: "0.2.3",
    },
    gitCommitsSinceLastRelease: [
      new GitCommitFake({ sha: "1234567890", message: "feat: add new feature" }),
    ],
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"0.3.0"}`)
})

Deno.test("given a feature commit from post-1.0 version, expect bumps minor version", async () => {
  const input = {
    lastRelease: {
      versionName: "1.2.3",
    },
    gitCommitsSinceLastRelease: [
      new GitCommitFake({ sha: "1234567890", message: "feat: add new feature" }),
    ],
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"1.3.0"}`)
})

Deno.test("given a fix commit from pre-1.0 version, expect bumps patch version", async () => {
  const input = {
    lastRelease: {
      versionName: "0.2.3",
    },
    gitCommitsSinceLastRelease: [
      new GitCommitFake({ sha: "1234567890", message: "fix: resolve issue with login" }),
    ],
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"0.2.4"}`)
})

Deno.test("given a fix commit from post-1.0 version, expect bumps patch version", async () => {
  const input = {
    lastRelease: {
      versionName: "1.2.3",
    },
    gitCommitsSinceLastRelease: [
      new GitCommitFake({ sha: "1234567890", message: "fix: resolve issue with login" }),
    ],
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"1.2.4"}`)
})

Deno.test("given a chore commit, expect no next version", async () => {
  const input = {
    lastRelease: {
      versionName: "0.2.3",
    },
    gitCommitsSinceLastRelease: [
      new GitCommitFake({ sha: "1234567890", message: "chore: update dependencies" }),
    ],
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input)

  assertEquals(code, 0)
  assertEquals(outputFileContents, "")
})

Deno.test("given multiple commits with all bump types, expect major bump takes priority", async () => {
  const input = {
    lastRelease: {
      versionName: "0.8.5",
    },
    gitCommitsSinceLastRelease: [
      new GitCommitFake({ sha: "1111111111", message: "fix: resolve login bug" }),
      new GitCommitFake({ sha: "2222222222", message: "feat: add new dashboard" }),
      new GitCommitFake({ sha: "3333333333", message: "feat!: restructure user authentication" }),
      new GitCommitFake({ sha: "4444444444", message: "fix: handle edge case" }),
    ],
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input)

  assertEquals(code, 0)
  // Should be a major version bump (1.0.0) even though there are minor and patch commits too
  assertEquals(outputFileContents, `{"version":"1.0.0"}`)
})

Deno.test("given minor and patch commits, expect minor bump takes priority", async () => {
  const input = {
    lastRelease: {
      versionName: "0.5.2",
    },
    gitCommitsSinceLastRelease: [
      new GitCommitFake({ sha: "5555555555", message: "fix: resolve critical bug" }),
      new GitCommitFake({ sha: "6666666666", message: "feat: add user preferences" }),
      new GitCommitFake({ sha: "7777777777", message: "fix: handle null values" }),
    ],
    gitCurrentBranch: "main",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input)

  assertEquals(code, 0)
  // Should be a minor version bump (0.6.0) even though there are patch commits too
  assertEquals(outputFileContents, `{"version":"0.6.0"}`)
})
