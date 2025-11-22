import { exec } from "./exec.ts"
import { assertEquals } from "@std/assert"
import { DeployStepInput } from "./types/environment.ts"
import { GitCommitFake } from "./types/git.test.ts"

const givenPluginInput: DeployStepInput = {
  gitCurrentBranch: "main",
  gitRepoOwner: "owner",
  gitRepoName: "repo",
  gitCommitsSinceLastRelease: [],
  nextVersionName: "1.0.0",
  testMode: true,
  lastRelease: null,
  gitCommitsAllLocalBranches: {
    "branch-1": [
      new GitCommitFake({}),
    ],
    "branch-2": [
      new GitCommitFake({}),
    ],
  },
  gitCommitsCurrentBranch: [
    new GitCommitFake({}),
  ],
}

Deno.test("allow commands that contain && that do not chain commands together", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `echo 'foo && bar'`,
    input: givenPluginInput,
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout, "foo && bar")
})

Deno.test("do not allow commands that contain && that chain commands together", async () => {
  let caughtError = false
  try {
    await exec.run({
      command: `echo 'foo' && echo 'bar'`,
      input: givenPluginInput,
    })
  } catch {
    caughtError = true
  }

  assertEquals(caughtError, true)
})

Deno.test("given contextual input data, expect the executed command receives the input data", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `python3 -c "import os; print(open(os.getenv('DATA_FILE_PATH'), 'r').read());"`,
    input: givenPluginInput,
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout, JSON.stringify(givenPluginInput))
})

Deno.test("given command forgets to write the output, expect to get undefined for the output", async () => {
  const { output } = await exec.run({
    command: `echo 'foo'`,
    input: givenPluginInput,
  })

  assertEquals(output, undefined)
})

Deno.test("given command writes output data to file, expect to get that data back", async () => {
  const { output } = await exec.run({
    command: `python3 -c 'import json, os; json.dump({"filesToCommit": ["foo.txt"]}, open(os.getenv("DATA_FILE_PATH"), "w"));'`,
    input: givenPluginInput,
  })

  assertEquals(output, {
    filesToCommit: ["foo.txt"],
  })
})
