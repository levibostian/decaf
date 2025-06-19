import { assertEquals } from "@std/assert"

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

Deno.test("given no latest release, expect 1.0.0", async () => {
  // Using an archived repo to avoid the version name ever changing.
  const input = {
    lastRelease: null,
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "feat: add new feature" },
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

Deno.test("given no latest release, given on prerelease branch, expect 1.0.0-beta.1", async () => {
  const input = {
    lastRelease: null,
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "feat: add new feature" },
    ],
    gitCurrentBranch: "beta",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input, { branches: [{ branch_name: "beta", prerelease: true, version_suffix: "beta" }] })

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"1.0.0-beta.1"}`)
})

Deno.test("given introducing a breaking change, expect bumps major version", async () => {
  const input = {
    lastRelease: {
      versionName: "1.0.0",
    },
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "feat!: add new authentication system" },
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

Deno.test("given a feature commit, expect bumps minor version", async () => {
  const input = {
    lastRelease: {
      versionName: "1.2.3",
    },
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "feat: add new feature" },
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

Deno.test("given a fix commit, expect bumps patch version", async () => {
  const input = {
    lastRelease: {
      versionName: "1.2.3",
    },
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "fix: resolve issue with login" },
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
      versionName: "1.2.3",
    },
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "chore: update dependencies" },
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

Deno.test("given latest release is not prerelease and next release is prerelease, expect bump and add prerelease suffix", async () => {
  const input = {
    lastRelease: {
      versionName: "1.2.3",
    },
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "feat: add new feature" },
    ],
    gitCurrentBranch: "beta",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input, {
    branches: [{ branch_name: "beta", prerelease: true, version_suffix: "beta" }],
  })

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"1.3.0-beta.1"}`)
})

Deno.test("given latest release is prerelease, next release is prerelease, next release is major bump, expect next prerelease version with new major version", async () => {
  const input = {
    lastRelease: {
      versionName: "1.2.3-beta.1",
    },
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "feat!: add new feature" },
    ],
    gitCurrentBranch: "beta",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input, {
    branches: [{ branch_name: "beta", prerelease: true, version_suffix: "beta" }],
  })

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"2.0.0-beta.1"}`)
})

Deno.test("given latest version is prerelease and next release is prerelease, expect next prerelease version", async () => {
  const input = {
    lastRelease: {
      versionName: "1.3.0-beta.1",
    },
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "feat: add new feature" },
    ],
    gitCurrentBranch: "beta",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input, {
    branches: [{ branch_name: "beta", prerelease: true, version_suffix: "beta" }],
  })

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"1.3.0-beta.2"}`)
})

Deno.test("given latest version is prerelease and next release is not prerelease, expect next non-prelease version", async () => {
  const input = {
    lastRelease: {
      versionName: "1.3.0-beta.1",
    },
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "feat: add new feature" },
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

Deno.test("given latest version is prerelease and next release is prerelease but different suffix, expect next prerelease version with new suffix", async () => {
  const input = {
    lastRelease: {
      versionName: "1.3.0-alpha.1",
    },
    gitCommitsSinceLastRelease: [
      { sha: "1234567890", message: "feat: add new feature" },
    ],
    gitCurrentBranch: "beta",
    gitRepoOwner: "foo",
    gitRepoName: "repo-name",
    testMode: false,
  }

  const { code, outputFileContents } = await runStep(input, {
    branches: [{ branch_name: "beta", prerelease: true, version_suffix: "beta" }],
  })

  assertEquals(code, 0)
  assertEquals(outputFileContents, `{"version":"1.3.0-beta.1"}`)
})
