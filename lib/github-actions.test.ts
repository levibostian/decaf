import { assertEquals, assertThrows } from "@std/assert"
import { GitHubActionsImpl } from "./github-actions.ts";
import { DetermineNextReleaseStepConfig } from "./steps/determine-next-release.ts";

Deno.test("getDetermineNextReleaseStepConfig returns undefined when env variable is not set", () => {
  Deno.env.delete("INPUT_ANALYZE_COMMITS_CONFIG");
  const githubActions = new GitHubActionsImpl();
  const result = githubActions.getDetermineNextReleaseStepConfig();
  assertEquals(result, undefined);
});

Deno.test("getDetermineNextReleaseStepConfig returns parsed config when env variable is set to valid JSON", () => {
  const expectedConfig: DetermineNextReleaseStepConfig = {
    branches: [
      {
        branch_name: "main",
        prerelease: false,
        version_suffix: "beta",
      },
    ],
  };

  const givenConfig = `
    {
      "branches": [
        {
          "branch_name": "main",
          "prerelease": false,
          "version_suffix": "beta"
        }
      ]
    }
  `
  Deno.env.set("INPUT_ANALYZE_COMMITS_CONFIG", givenConfig);
  assertEquals(new GitHubActionsImpl().getDetermineNextReleaseStepConfig(), expectedConfig)
});

Deno.test("getDetermineNextReleaseStepConfig throws error when env variable is set to invalid JSON", () => {
  Deno.env.set("INPUT_ANALYZE_COMMITS_CONFIG", "invalid-json");
  const githubActions = new GitHubActionsImpl();
  assertThrows(
    () => {
      githubActions.getDetermineNextReleaseStepConfig();
    },
    Error,
  );
});

Deno.test("getDetermineNextReleaseStepConfig throws error when provide an invalid JSON format", () => {
  const givenConfig = `
    {
      'branches': [
        {branch_name: 'main', prerelease: false},
        {branch_name: 'beta', prerelease: true},
        {branch_name: 'alpha', prerelease: true}
      ]
    }
  `
  Deno.env.set("INPUT_ANALYZE_COMMITS_CONFIG", givenConfig);
  const githubActions = new GitHubActionsImpl();
  assertThrows(
    () => {
      githubActions.getDetermineNextReleaseStepConfig();
    },
    Error,
  );
});