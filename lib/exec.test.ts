import { exec } from "./exec.ts";
import { assertEquals } from "@std/assert";
import { DeployEnvironment } from "./types/environment.ts";

const givenPluginInput: DeployEnvironment = {
  gitCurrentBranch: "main",
  gitRepoOwner: "owner",
  gitRepoName: "repo",
  gitCommitsSinceLastRelease: [],
  nextVersionName: "1.0.0",
  testMode: true,
  lastRelease: null,
};

Deno.test("given contextual input data, expect the executed command receives the input data", async () => {
  const { exitCode, stdout } = await exec.run({
    command:
      `python3 -c "import os; print(open(os.getenv('DATA_FILE_PATH'), 'r').read());"`,
    input: givenPluginInput,
  });

  assertEquals(exitCode, 0);
  assertEquals(stdout, JSON.stringify(givenPluginInput));
});

Deno.test("given command forgets to write the output, expect to get undefined for the output", async () => {
  const { output } = await exec.run({
    command: `echo 'foo'`,
    input: givenPluginInput,
  });

  assertEquals(output, undefined);
});

Deno.test("given command writes output data to file, expect to get that data back", async () => {
  const { output } = await exec.run({
    command:
      `python3 -c 'import json, os; json.dump({"filesToCommit": ["foo.txt"]}, open(os.getenv("DATA_FILE_PATH"), "w"));'`,
    input: givenPluginInput,
  });

  assertEquals(output, {
    filesToCommit: ["foo.txt"],
  });
});
