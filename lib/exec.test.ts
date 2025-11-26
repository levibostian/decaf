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

Deno.test("allow commands that contain && that chain commands together", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `echo 'foo' && echo 'bar'`,
    input: givenPluginInput,
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout, "foo\nbar")
})

Deno.test("allow commands that use >> for output redirection", async () => {
  const tempFile = await Deno.makeTempFile()
  try {
    const { exitCode } = await exec.run({
      command: `echo "test_output" >> "${tempFile}"`,
      input: givenPluginInput,
    })

    const content = await Deno.readTextFile(tempFile)
    assertEquals(exitCode, 0)
    assertEquals(content.trim(), "test_output")
  } finally {
    await Deno.remove(tempFile)
  }
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

Deno.test("throwOnNonZeroExitCode: false allows non-zero exit codes", async () => {
  const { exitCode } = await exec.run({
    command: `exit 42`,
    input: givenPluginInput,
    throwOnNonZeroExitCode: false,
  })

  assertEquals(exitCode, 42)
})

Deno.test("throwOnNonZeroExitCode: true throws on non-zero exit code", async () => {
  let caughtError = false
  let errorMessage = ""
  try {
    await exec.run({
      command: `exit 1`,
      input: givenPluginInput,
      throwOnNonZeroExitCode: true,
    })
  } catch (error) {
    caughtError = true
    errorMessage = (error as Error).message
  }

  assertEquals(caughtError, true)
  assertEquals(errorMessage.includes("failed with exit code: 1"), true)
})

Deno.test("default behavior throws on non-zero exit code", async () => {
  let caughtError = false
  try {
    await exec.run({
      command: `exit 5`,
      input: givenPluginInput,
    })
  } catch {
    caughtError = true
  }

  assertEquals(caughtError, true)
})

Deno.test("envVars parameter passes custom environment variables", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `echo $CUSTOM_VAR`,
    input: givenPluginInput,
    envVars: { CUSTOM_VAR: "test_value" },
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout, "test_value")
})

Deno.test("envVars parameter supports multiple environment variables", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `echo "$VAR1-$VAR2-$VAR3"`,
    input: givenPluginInput,
    envVars: {
      VAR1: "foo",
      VAR2: "bar",
      VAR3: "baz",
    },
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout, "foo-bar-baz")
})

Deno.test("allow commands that use pipes", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `echo "hello world" | tr 'a-z' 'A-Z'`,
    input: givenPluginInput,
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout, "HELLO WORLD")
})

Deno.test("allow commands that use semicolons to run commands sequentially", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `echo "first"; echo "second"`,
    input: givenPluginInput,
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout.includes("first"), true)
  assertEquals(stdout.includes("second"), true)
})

Deno.test("allow commands that use || operator", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `false || echo "fallback"`,
    input: givenPluginInput,
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout, "fallback")
})

Deno.test("commands with special characters in strings", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `echo 'special: $%^&*()[]{}|\\<>?'`,
    input: givenPluginInput,
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout, "special: $%^&*()[]{}|\\<>?")
})

Deno.test("commands with quotes and escaping", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `echo "she said \\"hello\\""`,
    input: givenPluginInput,
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout, 'she said "hello"')
})

Deno.test("command with > output redirection", async () => {
  const tempFile = await Deno.makeTempFile()
  try {
    const { exitCode } = await exec.run({
      command: `echo "test_output" > "${tempFile}"`,
      input: givenPluginInput,
    })

    const content = await Deno.readTextFile(tempFile)
    assertEquals(exitCode, 0)
    assertEquals(content.trim(), "test_output")
  } finally {
    await Deno.remove(tempFile)
  }
})

Deno.test("command with input redirection", async () => {
  const tempFile = await Deno.makeTempFile()
  try {
    await Deno.writeTextFile(tempFile, "input_data")
    const { exitCode, stdout } = await exec.run({
      command: `cat < "${tempFile}"`,
      input: givenPluginInput,
    })

    assertEquals(exitCode, 0)
    assertEquals(stdout, "input_data")
  } finally {
    await Deno.remove(tempFile)
  }
})

Deno.test("command that writes to stderr still succeeds", async () => {
  const { exitCode } = await exec.run({
    command: `echo "error message" >&2`,
    input: givenPluginInput,
  })

  assertEquals(exitCode, 0)
})

Deno.test("complex multi-line command", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `
      for i in 1 2 3; do
        echo "Line $i"
      done
    `,
    input: givenPluginInput,
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout.includes("Line 1"), true)
  assertEquals(stdout.includes("Line 2"), true)
  assertEquals(stdout.includes("Line 3"), true)
})

Deno.test("command with both input and custom envVars", async () => {
  const { exitCode, stdout } = await exec.run({
    command: `python3 -c "import os; print(os.getenv('CUSTOM_ENV') + '-' + os.getenv('DATA_FILE_PATH')[:6])"`,
    input: givenPluginInput,
    envVars: { CUSTOM_ENV: "custom_value" },
  })

  assertEquals(exitCode, 0)
  assertEquals(stdout.startsWith("custom_value-"), true)
})
