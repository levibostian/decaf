import { assertEquals } from "jsr:@std/assert@1";
import { afterEach, describe, it } from "jsr:@std/testing@1/bdd";
import { restore, stub } from "jsr:@std/testing@1/mock";
import { assertSnapshot } from "jsr:@std/testing@1/snapshot";
import { GetLatestReleaseStep } from "./lib/steps/get-latest-release.ts";
import { run } from "./deploy.ts";
import { GitHubCommit, GitHubRelease } from "./lib/github-api.ts";
import { GitHubCommitFake, GitHubReleaseFake } from "./lib/github-api.test.ts";
import {
  GetCommitsSinceLatestReleaseStep,
} from "./lib/steps/get-commits-since-latest-release.ts";
import {
  DetermineNextReleaseStep,
  DetermineNextReleaseStepConfig,
} from "./lib/steps/determine-next-release.ts";
import { CreateNewReleaseStep } from "./lib/steps/create-new-release.ts";
import { DeployStep } from "./lib/steps/deploy.ts";
import { getLogMock } from "./lib/log.test.ts";
import { GitHubActions } from "./lib/github-actions.ts";
import { SimulateMerge } from "./lib/simulate-merge.ts";
import { PrepareTestModeEnvStep } from "./lib/steps/prepare-testmode-env.ts";
import { mock, when } from "./lib/mock/mock.ts";

describe("run the tool in different scenarios", () => {
  afterEach(() => {
    restore();
  });

  it("given new commit created during deployment, expect create release from new commit", async () => {
    const givenLatestCommitOnBranch = new GitHubCommitFake({
      message: "feat: trigger a release",
      sha: "trigger-release",
    });
    const givenCreatedCommitDuringDeploy = new GitHubCommitFake({
      message: "chore: commit created during deploy",
      sha: "commit-created-during-deploy",
    });

    const { createNewReleaseStepMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [givenLatestCommitOnBranch],
      gitCommitCreatedDuringDeploy: givenCreatedCommitDuringDeploy,
      nextReleaseVersion: "1.0.0",
    });

    assertEquals(
      createNewReleaseStepMock.calls[0].args[0].commit.sha,
      givenCreatedCommitDuringDeploy.sha,
    );
  });

  it("given no new commits created during deployment, expect create release from latest commit found on github", async () => {
    const givenLatestCommitOnBranch = new GitHubCommitFake({
      message: "feat: trigger a release",
      sha: "trigger-release",
    });

    const { createNewReleaseStepMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [givenLatestCommitOnBranch],
      gitCommitCreatedDuringDeploy: undefined,
      nextReleaseVersion: "1.0.0",
    });

    assertEquals(
      createNewReleaseStepMock.calls[0].args[0].commit.sha,
      givenLatestCommitOnBranch.sha,
    );
  });

  it("given no commits created since last deployment, expect to not run a new deployment", async () => {
    const { determineNextReleaseStepMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [],
    });

    // Exit early, before running the next step after getting list of commits since last deployment
    assertEquals(determineNextReleaseStepMock.calls.length, 0);
  });

  it("given no commits trigger a release, expect to not run a new deployment", async () => {
    const { deployStepMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [new GitHubCommitFake()],
      nextReleaseVersion: undefined,
    });

    // Exit early, before running the next step after getting list of commits since last deployment
    assertEquals(deployStepMock.calls.length, 0);
  });
});

describe("test github actions output", () => {
  it("should set new release version output when a new release is created", async () => {
    const { githubActionsSetOutputMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [new GitHubCommitFake({
        message: "feat: trigger a release",
        sha: "trigger-release",
      })],
      nextReleaseVersion: "1.0.0",
    });

    assertEquals(
      githubActionsSetOutputMock.calls[1].args[0], {key: "new_release_version", value: "1.0.0"},
    );
  })
  it("should not set new release version output when no new release is created", async () => {
    const { githubActionsSetOutputMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [],
      nextReleaseVersion: "1.0.0",
    });

    assertEquals(githubActionsSetOutputMock.calls.filter(call => call.args[0].key === "new_release_version").length, 0);
  })
  it("should set new pre-release version output when a new pre-release is created", async () => {
    const { githubActionsSetOutputMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [new GitHubCommitFake({
        message: "feat: trigger a release",
        sha: "trigger-release",
      })],
      nextReleaseVersion: "1.0.0-beta.1",
      determineNextReleaseStepConfig: {
          branches: [{
            branch_name: 'main',
            prerelease: true,
            version_suffix: 'beta'
          }]
      },
    });

    assertEquals(
      githubActionsSetOutputMock.calls[1].args[0], {key: "new_release_version", value: "1.0.0-beta.1"},      
    );
  })
  it("should set test mode output when running in test mode", async () => {
    const { githubActionsSetOutputMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [new GitHubCommitFake({
        message: "feat: trigger a release",
        sha: "trigger-release",
      })],
      nextReleaseVersion: "1.0.0",
      githubActionEventThatTriggeredTool: "pull_request",
      commitsCreatedBySimulatedMerge: [new GitHubCommitFake()],
    });

    assertEquals(
      githubActionsSetOutputMock.calls[0].args[0], {key: "test_mode_on", value: "true"},
    );
  })
  it("should add commits created during simulated merges to list of commits to analyze", async () => {    
    const givenLatestCommitOnBranch = new GitHubCommitFake({
      message: "feat: trigger a release",
      sha: "trigger-release",
    });

    const givenCommitsCreatedBySimulatedMerge = [
      new GitHubCommitFake({
        message: "Merge commit created during simulated merge",
        sha: "merge-commit-created-during-simulated-merge",
      }),
      new GitHubCommitFake({
        message: "feat: commit created during simulated merge",
        sha: "commit-created-during-simulated-merge",
      }),
    ];

    const expectedCommitsAnalyzed = [
      givenCommitsCreatedBySimulatedMerge[0], // newest commit first. like `git log`
      givenCommitsCreatedBySimulatedMerge[1],
      givenLatestCommitOnBranch,
    ]

    const { determineNextReleaseStepMock } = await setupTestEnvironmentAndRun({
      pullRequestTargetBranchName: "main",
      currentBranchName: "sweet-feature",
      githubActionEventThatTriggeredTool: "pull_request",
      commitsSinceLatestRelease: [givenLatestCommitOnBranch],
      gitCommitCreatedDuringDeploy: undefined,
      nextReleaseVersion: "1.0.0",
      commitsCreatedBySimulatedMerge: givenCommitsCreatedBySimulatedMerge,
    });

    assertEquals(determineNextReleaseStepMock.calls[0].args[0].commits, expectedCommitsAnalyzed);
  })
})

describe("user facing logs", () => {
  it("given no commits will trigger a release, expect logs to easily communicate that to the user", async (t) => {
    const { logMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [new GitHubCommitFake()],
      nextReleaseVersion: undefined,
    });

    await assertSnapshot(t, logMock.getLogs({includeDebugLogs: false}));
  })

  it("given no commits created since last deployment, expect logs to easily communicate that to the user", async (t) => {
    const { logMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [],
    });

    await assertSnapshot(t, logMock.getLogs({includeDebugLogs: false}));
  })

  it("given new commit created during deployment, expect logs to easily communicate that to the user", async (t) => {
    const givenLatestCommitOnBranch = new GitHubCommitFake({
      message: "feat: trigger a release",
      sha: "trigger-release",
    });
    const givenCreatedCommitDuringDeploy = new GitHubCommitFake({
      message: "chore: commit created during deploy",
      sha: "commit-created-during-deploy",
    });

    const { logMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [givenLatestCommitOnBranch],
      gitCommitCreatedDuringDeploy: givenCreatedCommitDuringDeploy,
      nextReleaseVersion: "1.0.0",
    });

    await assertSnapshot(t, logMock.getLogs({includeDebugLogs: false}));
  })

  it("given no new commits created during deployment, expect logs to easily communicate that to the user", async (t) => {
    const givenLatestCommitOnBranch = new GitHubCommitFake({
      message: "feat: trigger a release",
      sha: "trigger-release",
    });

    const { logMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [givenLatestCommitOnBranch],
      gitCommitCreatedDuringDeploy: undefined,
      nextReleaseVersion: "1.0.0",
    });

    await assertSnapshot(t, logMock.getLogs({includeDebugLogs: false}));
  })

  it("given running in test mode, given commits that trigger a release, expect logs to easily communicate that to the user", async (t) => {
    const givenBaseBranch = "sweet-feature";
    const givenTargetBranch = "main";
    
    const givenLatestCommitOnBranch = new GitHubCommitFake({
      message: "feat: trigger a release",
      sha: "trigger-release",
    });

    const { logMock } = await setupTestEnvironmentAndRun({
      pullRequestTargetBranchName: givenTargetBranch,
      currentBranchName: givenBaseBranch,
      githubActionEventThatTriggeredTool: "pull_request",
      commitsSinceLatestRelease: [givenLatestCommitOnBranch],
      gitCommitCreatedDuringDeploy: undefined,
      nextReleaseVersion: "1.0.0",
    });

    await assertSnapshot(t, logMock.getLogs({includeDebugLogs: false}));
  })
})

describe("test the event that triggered running the tool", () => {
  it("should exit early if the tool is triggered by an unsupported event", async () => {
    const {getLatestReleaseStepMock, prepareEnvironmentForTestModeMock} = await setupTestEnvironmentAndRun({
      githubActionEventThatTriggeredTool: "release"
    });

    assertEquals(getLatestReleaseStepMock.calls.length, 0);
    assertEquals(prepareEnvironmentForTestModeMock.calls.length, 0);
  })
  it("should run a deployment if triggered from a push event, expect not to run simulated merge", async () => {
    const {githubActionsSetOutputMock, prepareEnvironmentForTestModeMock} = await setupTestEnvironmentAndRun({
      githubActionEventThatTriggeredTool: "push",
      nextReleaseVersion: "1.0.0",
      commitsSinceLatestRelease: [new GitHubCommitFake({
        message: "feat: trigger a release",
        sha: "trigger-release",
      })],
    });

    assertEquals(githubActionsSetOutputMock.calls[1].args[0].value, "1.0.0");
    assertEquals(githubActionsSetOutputMock.calls[0].args[0], {key: "test_mode_on", value: "false"});
    assertEquals(prepareEnvironmentForTestModeMock.calls.length, 0);
  })
  it("should run a deployment in test mode if triggered from a pull_request event, expect to run merge simulation", async () => {
    const givenBaseBranch = "sweet-feature";
    const givenTargetBranch = "main";

    const {githubActionsSetOutputMock, prepareEnvironmentForTestModeMock, getLatestReleaseStepMock} = await setupTestEnvironmentAndRun({
      pullRequestTargetBranchName: givenTargetBranch,
      currentBranchName: givenBaseBranch,
      githubActionEventThatTriggeredTool: "pull_request",
      nextReleaseVersion: "1.0.0",
      commitsSinceLatestRelease: [new GitHubCommitFake({
        message: "feat: trigger a release",
        sha: "trigger-release",
      })],
    });

    assertEquals(
      githubActionsSetOutputMock.calls[1].args[0], {key: "new_release_version", value: "1.0.0"},
    );
    assertEquals(githubActionsSetOutputMock.calls[0].args[0], {key: "test_mode_on", value: "true"});
    assertEquals(prepareEnvironmentForTestModeMock.calls.length, 1);

    // We expect that after simulated merge, the current branch is now the target branch.
    assertEquals(getLatestReleaseStepMock.calls[0].args[0].branch, givenTargetBranch)
  })
})

const setupTestEnvironmentAndRun = async ({
  latestRelease,
  commitsSinceLatestRelease,
  nextReleaseVersion,
  gitCommitCreatedDuringDeploy,
  determineNextReleaseStepConfig,
  githubActionEventThatTriggeredTool,
  pullRequestTargetBranchName,
  currentBranchName,
  commitsCreatedBySimulatedMerge,
}: {
  latestRelease?: GitHubRelease;
  commitsSinceLatestRelease?: GitHubCommit[];
  nextReleaseVersion?: string;
  gitCommitCreatedDuringDeploy?: GitHubCommit;
  determineNextReleaseStepConfig?: DetermineNextReleaseStepConfig;
  githubActionEventThatTriggeredTool?: string;
  pullRequestTargetBranchName?: string;
  currentBranchName?: string;
  commitsCreatedBySimulatedMerge?: GitHubCommit[];
}) => {
  // Set some defaults. 
  const pullRequestTargetBranch = pullRequestTargetBranchName || "main"; // assume we are running a pull_request event that merges into main 
  const currentBranch = currentBranchName || "main"; // assume we are running a push event 

  // default to push event, since we want to test the actual deployment process and not test mode by default. 
  Deno.env.set("GITHUB_REF", `refs/heads/${currentBranch}`);
  Deno.env.set("GITHUB_REPOSITORY", "levibostian/new-deployment-tool");

  const getLatestReleaseStep = {} as GetLatestReleaseStep;
  const getLatestReleaseStepMock = stub(
    getLatestReleaseStep,
    "getLatestReleaseForBranch",
    async () => {
      return latestRelease || GitHubReleaseFake;
    },
  );

  const getCommitsSinceLatestReleaseStep =
    {} as GetCommitsSinceLatestReleaseStep;
  const getCommitsSinceLatestReleaseStepMock = stub(
    getCommitsSinceLatestReleaseStep,
    "getAllCommitsSinceGivenCommit",
    async () => {
      return commitsSinceLatestRelease || [];
    },
  );

  const determineNextReleaseStep = {} as DetermineNextReleaseStep;
  const determineNextReleaseStepMock = stub(
    determineNextReleaseStep,
    "getNextReleaseVersion",
    async () => {
      return nextReleaseVersion || null;
    },
  );

  const deployStep = {} as DeployStep;
  const deployStepMock = stub(deployStep, "runDeploymentCommands", async () => {
    return gitCommitCreatedDuringDeploy || null;
  });

  const createNewReleaseStep = {} as CreateNewReleaseStep;
  const createNewReleaseStepMock = stub(
    createNewReleaseStep,
    "createNewRelease",
    async () => {
      return;
    },
  );

  const logMock = getLogMock();
  
  const githubActions = {} as GitHubActions
  const githubActionsGetDetermineNextReleaseStepConfigMock = stub(
    githubActions,
    "getDetermineNextReleaseStepConfig",
    () => {
      return determineNextReleaseStepConfig
    },
  );
  const githubActionsSetOutputMock = stub(
    githubActions,
    "setOutput",
    () => {
      return;
    },
  );
  stub(githubActions, "getEventThatTriggeredThisRun", () => {
    return githubActionEventThatTriggeredTool || "push";
  })
  const isRunningInPullRequest = githubActionEventThatTriggeredTool === "pull_request";

  const githubActionsIsRunningInPullRequestMock = stub(githubActions, "isRunningInPullRequest", async () => {
    return isRunningInPullRequest ? {
      baseBranch: currentBranch,
      targetBranch: pullRequestTargetBranch,
      prTitle: "title",
      prDescription: "description"
    } : undefined
  });
  stub(githubActions, "getSimulatedMergeType", (): 'merge' | 'rebase' | 'squash' => {
    return 'merge';
  })

  stub(githubActions, "getNameOfCurrentBranch", () => {
    return currentBranch;
  });

  const prepareEnvironmentForTestMode = mock<PrepareTestModeEnvStep>()
  const prepareEnvironmentForTestModeMock = when(prepareEnvironmentForTestMode, "prepareEnvironmentForTestMode", async () => {
    if (!isRunningInPullRequest) return undefined;

    return {currentGitBranch: pullRequestTargetBranch, commitsCreatedDuringSimulatedMerges: commitsCreatedBySimulatedMerge || []}
  })

  await run({
    prepareEnvironmentForTestMode,
    getLatestReleaseStep,
    getCommitsSinceLatestReleaseStep,
    determineNextReleaseStep,
    deployStep,
    createNewReleaseStep,
    log: logMock,
    githubActions
  });

  return {
    getLatestReleaseStepMock,
    getCommitsSinceLatestReleaseStepMock,
    determineNextReleaseStepMock,
    deployStepMock,
    createNewReleaseStepMock,
    logMock,
    githubActionsGetDetermineNextReleaseStepConfigMock,
    githubActionsSetOutputMock,
    githubActionsIsRunningInPullRequestMock,
    prepareEnvironmentForTestModeMock
  };
};
