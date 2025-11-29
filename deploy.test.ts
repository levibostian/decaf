import { assertEquals, assertRejects } from "@std/assert"
import { afterEach, describe, it } from "@std/testing/bdd"
import { restore, stub } from "@std/testing/mock"
import { assertSnapshot } from "@std/testing/snapshot"
import { run } from "./deploy.ts"
import { GetCommitsSinceLatestReleaseStep } from "./lib/steps/get-commits-since-latest-release.ts"
import { getLogMock } from "./lib/log.test.ts"
import { Environment } from "./lib/environment.ts"
import { PrepareTestModeEnvStep } from "./lib/steps/prepare-testmode-env.ts"
import { mock, when } from "./lib/mock/mock.ts"
import { StepRunner } from "./lib/step-runner.ts"
import { GetLatestReleaseStepOutputFake } from "./lib/steps/types/output.test.ts"
import { GetLatestReleaseStepOutput } from "./lib/steps/types/output.ts"
import { ConvenienceStep } from "./lib/steps/convenience.ts"
import { GitCommit } from "./lib/types/git.ts"
import { GitCommitFake } from "./lib/types/git.test.ts"
import { Git } from "./lib/git.ts"
import { Exec } from "./lib/exec.ts"

describe("run the tool in different scenarios", () => {
  afterEach(() => {
    restore()
  })

  it("given no commits created since last deployment, expect to not run a new deployment", async () => {
    const { determineNextReleaseVersionStepMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [],
    })

    // Exit early, before running the next step after getting list of commits since last deployment
    assertEquals(determineNextReleaseVersionStepMock.calls.length, 0)
  })

  it("given no commits trigger a release, expect to not run a new deployment", async () => {
    const { deployStepMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [new GitCommitFake()],
      nextReleaseVersion: undefined,
    })

    // Exit early, before running the next step after getting list of commits since last deployment
    assertEquals(deployStepMock.calls.length, 0)
  })
})

describe("test github actions output", () => {
  it("should set new release version output when a new release is created", async () => {
    const { setOutputMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [
        new GitCommitFake({
          message: "feat: trigger a release",
          sha: "trigger-release",
        }),
      ],
      nextReleaseVersion: "1.0.0",
    })

    assertEquals(
      setOutputMock.calls[1].args[0],
      { key: "new_release_version", value: "1.0.0" },
    )
  })
  it("should not set new release version output when no new release is created", async () => {
    const { setOutputMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [],
      nextReleaseVersion: "1.0.0",
    })

    assertEquals(setOutputMock.calls.filter((call) => call.args[0].key === "new_release_version").length, 0)
  })
  it("should set new pre-release version output when a new pre-release is created", async () => {
    const { setOutputMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [
        new GitCommitFake({
          message: "feat: trigger a release",
          sha: "trigger-release",
        }),
      ],
      nextReleaseVersion: "1.0.0-beta.1",
    })

    assertEquals(
      setOutputMock.calls[1].args[0],
      { key: "new_release_version", value: "1.0.0-beta.1" },
    )
  })
  it("should set test mode output when running in test mode", async () => {
    const { setOutputMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [
        new GitCommitFake({
          message: "feat: trigger a release",
          sha: "trigger-release",
        }),
      ],
      nextReleaseVersion: "1.0.0",
      githubActionEventThatTriggeredTool: "pull_request",
      commitsCreatedBySimulatedMerge: [new GitCommitFake()],
    })

    assertEquals(
      setOutputMock.calls[0].args[0],
      { key: "test_mode_on", value: "true" },
    )
  })
  it("should add commits created during simulated merges to list of commits to analyze", async () => {
    const givenLatestCommitOnBranch = new GitCommitFake({
      message: "feat: trigger a release",
      sha: "trigger-release",
    })

    const givenCommitsCreatedBySimulatedMerge = [
      new GitCommitFake({
        message: "Merge commit created during simulated merge",
        sha: "merge-commit-created-during-simulated-merge",
      }),
      new GitCommitFake({
        message: "feat: commit created during simulated merge",
        sha: "commit-created-during-simulated-merge",
      }),
    ]

    const expectedCommitsAnalyzed = [
      givenCommitsCreatedBySimulatedMerge[0], // newest commit first. like `git log`
      givenCommitsCreatedBySimulatedMerge[1],
      givenLatestCommitOnBranch,
    ]

    const { determineNextReleaseVersionStepMock } = await setupTestEnvironmentAndRun({
      pullRequestTargetBranchName: "main",
      currentBranchName: "sweet-feature",
      githubActionEventThatTriggeredTool: "pull_request",
      commitsSinceLatestRelease: [...givenCommitsCreatedBySimulatedMerge, givenLatestCommitOnBranch],
      nextReleaseVersion: "1.0.0",
      commitsCreatedBySimulatedMerge: givenCommitsCreatedBySimulatedMerge,
    })

    assertEquals(determineNextReleaseVersionStepMock.calls[0].args[0].gitCommitsSinceLastRelease, expectedCommitsAnalyzed)
  })

  // Test a bug found where you are in test mode > simulate merge > new commits are made > tool says "zero commits created" > exits early.
  it("should not exit early if parent branch has no commits, but we make new commits during simulated merge", async () => {
    const givenCommitsCreatedBySimulatedMerge = [
      new GitCommitFake({
        message: "Merge commit created during simulated merge",
        sha: "merge-commit-created-during-simulated-merge",
      }),
      new GitCommitFake({
        message: "feat: commit created during simulated merge",
        sha: "commit-created-during-simulated-merge",
      }),
    ]

    const { setOutputMock } = await setupTestEnvironmentAndRun({
      pullRequestTargetBranchName: "main",
      currentBranchName: "sweet-feature",
      githubActionEventThatTriggeredTool: "pull_request",
      commitsSinceLatestRelease: givenCommitsCreatedBySimulatedMerge, // the only commits we have are the ones created during simulated merge
      nextReleaseVersion: "1.0.0",
      commitsCreatedBySimulatedMerge: givenCommitsCreatedBySimulatedMerge,
    })

    const didExitEarly = setOutputMock.calls.filter((call) => call.args[0].key === "new_release_version").length === 0

    assertEquals(didExitEarly, false)
  })
})

describe("user facing logs", () => {
  it("given no commits will trigger a release, expect logs to easily communicate that to the user", async (t) => {
    const { logMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [new GitCommitFake()],
      nextReleaseVersion: undefined,
    })

    await assertSnapshot(t, logMock.getLogs({ includeDebugLogs: false }))
  })

  it("given no commits created since last deployment, expect logs to easily communicate that to the user", async (t) => {
    const { logMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: [],
    })

    await assertSnapshot(t, logMock.getLogs({ includeDebugLogs: false }))
  })

  it("given no release has ever been made, expect logs to easily communicate that to the user", async (t) => {
    const givenLatestCommitOnBranch = new GitCommitFake({
      message: "feat: trigger a release",
      sha: "trigger-release",
    })

    const { logMock } = await setupTestEnvironmentAndRun({
      latestRelease: null,
      commitsSinceLatestRelease: [givenLatestCommitOnBranch],
      nextReleaseVersion: "1.0.0",
    })

    await assertSnapshot(t, logMock.getLogs({ includeDebugLogs: false }))
  })

  it("given running in test mode, given commits that trigger a release, expect logs to easily communicate that to the user", async (t) => {
    const givenBaseBranch = "sweet-feature"
    const givenTargetBranch = "main"

    const givenLatestCommitOnBranch = new GitCommitFake({
      message: "feat: trigger a release",
      sha: "trigger-release",
    })

    const { logMock } = await setupTestEnvironmentAndRun({
      pullRequestTargetBranchName: givenTargetBranch,
      currentBranchName: givenBaseBranch,
      githubActionEventThatTriggeredTool: "pull_request",
      commitsSinceLatestRelease: [givenLatestCommitOnBranch],
      nextReleaseVersion: "1.0.0",
    })

    await assertSnapshot(t, logMock.getLogs({ includeDebugLogs: false }))
  })
})

describe("test the event that triggered running the tool", () => {
  it("should exit early if the tool is triggered by an unsupported event", async () => {
    const { runGetLatestOnCurrentBranchReleaseStepMock, prepareEnvironmentForTestModeMock } = await setupTestEnvironmentAndRun({
      githubActionEventThatTriggeredTool: "other",
    })

    assertEquals(runGetLatestOnCurrentBranchReleaseStepMock.calls.length, 0)
    assertEquals(prepareEnvironmentForTestModeMock.calls.length, 0)
  })
  it("should run a deployment if triggered from a push event, expect not to run simulated merge", async () => {
    const { setOutputMock, prepareEnvironmentForTestModeMock } = await setupTestEnvironmentAndRun({
      githubActionEventThatTriggeredTool: "push",
      nextReleaseVersion: "1.0.0",
      commitsSinceLatestRelease: [
        new GitCommitFake({
          message: "feat: trigger a release",
          sha: "trigger-release",
        }),
      ],
    })

    assertEquals(setOutputMock.calls[1].args[0].value, "1.0.0")
    assertEquals(setOutputMock.calls[0].args[0], { key: "test_mode_on", value: "false" })
    assertEquals(prepareEnvironmentForTestModeMock.calls.length, 0)
  })
  it("should run a deployment in test mode if triggered from a pull_request event, expect to run merge simulation", async () => {
    const givenBaseBranch = "sweet-feature"
    const givenTargetBranch = "main"

    const { setOutputMock, prepareEnvironmentForTestModeMock, runGetLatestOnCurrentBranchReleaseStepMock } = await setupTestEnvironmentAndRun({
      pullRequestTargetBranchName: givenTargetBranch,
      currentBranchName: givenBaseBranch,
      githubActionEventThatTriggeredTool: "pull_request",
      nextReleaseVersion: "1.0.0",
      commitsSinceLatestRelease: [
        new GitCommitFake({
          message: "feat: trigger a release",
          sha: "trigger-release",
        }),
      ],
    })

    assertEquals(
      setOutputMock.calls[1].args[0],
      { key: "new_release_version", value: "1.0.0" },
    )
    assertEquals(setOutputMock.calls[0].args[0], { key: "test_mode_on", value: "true" })
    assertEquals(prepareEnvironmentForTestModeMock.calls.length, 1)

    // We expect that after simulated merge, the current branch is now the target branch.
    assertEquals(runGetLatestOnCurrentBranchReleaseStepMock.calls[0].args[0].gitCurrentBranch, givenTargetBranch)
  })
})

describe("deployment verification after deploy", () => {
  it("should verify the latest release matches the deployed version after deployment", async () => {
    const deployedVersion = "2.0.0"
    const { setOutputMock } = await setupTestEnvironmentAndRun({
      latestRelease: { versionName: "1.0.0", commitSha: "sha1" },
      latestReleaseAfterDeploy: { versionName: deployedVersion, commitSha: "sha2" },
      nextReleaseVersion: deployedVersion,
      commitsSinceLatestRelease: [new GitCommitFake()],
    })

    assertEquals(
      setOutputMock.calls[1].args[0],
      { key: "new_release_version", value: deployedVersion },
    )
  })

  it("should throw if the latest release does not match the deployed version after deployment", async () => {
    const deployedVersion = "2.0.0"
    const wrongLatestRelease = "1.5.0"

    await assertRejects(async () => {
      await setupTestEnvironmentAndRun({
        latestRelease: { versionName: wrongLatestRelease, commitSha: "sha2" },
        latestReleaseAfterDeploy: { versionName: wrongLatestRelease, commitSha: "sha2" },
        nextReleaseVersion: deployedVersion,
        commitsSinceLatestRelease: [new GitCommitFake()],
      })
    })
  })
})

describe("input data passed to steps", () => {
  it("should pass correct input data to determineNextReleaseVersionStep", async () => {
    const givenCommitsCreatedBySimulatedMerge = new GitCommitFake({
      message: "Merge commit",
    })
    const givenCommitsOnBranch = [
      givenCommitsCreatedBySimulatedMerge,
      new GitCommitFake({ message: "feat: commit on branch" }),
      new GitCommitFake({ message: "feat: another commit on branch" }),
    ]

    const { determineNextReleaseVersionStepMock } = await setupTestEnvironmentAndRun({
      commitsSinceLatestRelease: givenCommitsOnBranch,
      commitsCreatedBySimulatedMerge: [givenCommitsCreatedBySimulatedMerge],
      nextReleaseVersion: "1.0.0",
    })

    assertEquals(
      determineNextReleaseVersionStepMock.calls[0].args[0].gitCommitsSinceLastRelease,
      givenCommitsOnBranch,
    )
  })
})

const setupTestEnvironmentAndRun = async ({
  latestRelease,
  latestReleaseAfterDeploy,
  commitsSinceLatestRelease,
  nextReleaseVersion,
  githubActionEventThatTriggeredTool,
  pullRequestTargetBranchName,
  currentBranchName,
  commitsCreatedBySimulatedMerge,
  gitCommitsCurrentBranch,
}: {
  latestRelease?: GetLatestReleaseStepOutput | null
  latestReleaseAfterDeploy?: GetLatestReleaseStepOutput | null
  commitsSinceLatestRelease?: GitCommit[]
  nextReleaseVersion?: string
  githubActionEventThatTriggeredTool?: "push" | "pull_request" | "other"
  pullRequestTargetBranchName?: string
  currentBranchName?: string
  commitsCreatedBySimulatedMerge?: GitCommit[]
  gitCommitsCurrentBranch?: GitCommit[]
}) => {
  // Set some defaults.
  const pullRequestTargetBranch = pullRequestTargetBranchName || "main" // assume we are running a pull_request event that merges into main
  const currentBranch = currentBranchName || "main" // assume we are running a push event

  // default to push event, since we want to test the actual deployment process and not test mode by default.
  Deno.env.set("GITHUB_REF", `refs/heads/${currentBranch}`)
  Deno.env.set("GITHUB_REPOSITORY", "levibostian/decaf")

  let hasRanConvenienceCommandsAfterDeployment = false
  const convenienceStep = mock<ConvenienceStep>()
  when(convenienceStep, "runConvenienceCommands", async () => {
    if (hasRanDeployStep) hasRanConvenienceCommandsAfterDeployment = true
    return { gitCommitsAllLocalBranches: { "latest": [] }, gitCommitsCurrentBranch: gitCommitsCurrentBranch || [] }
  })

  const stepRunner = {} as StepRunner
  const runGetLatestOnCurrentBranchReleaseStepMock = stub(
    stepRunner,
    "runGetLatestOnCurrentBranchReleaseStep",
    async () => {
      if (hasRanConvenienceCommandsAfterDeployment) {
        if (latestReleaseAfterDeploy) return latestReleaseAfterDeploy
        if (nextReleaseVersion) return { versionName: nextReleaseVersion, commitSha: "deploy-sha" }
      }

      if (latestRelease === null) return null
      if (latestRelease === undefined) return GetLatestReleaseStepOutputFake
      return latestRelease
    },
  )
  const determineNextReleaseVersionStepMock = stub(
    stepRunner,
    "determineNextReleaseVersionStep",
    async () => {
      if (nextReleaseVersion) return { version: nextReleaseVersion }
      return null
    },
  )

  const getCommitsSinceLatestReleaseStep = {} as GetCommitsSinceLatestReleaseStep
  const getCommitsSinceLatestReleaseStepMock = stub(
    getCommitsSinceLatestReleaseStep,
    "getAllCommitsSinceGivenCommit",
    async () => {
      return commitsSinceLatestRelease || []
    },
  )

  let hasRanDeployStep = false
  const deployStepMock = stub(stepRunner, "runDeployStep", async () => {
    hasRanDeployStep = true
    return
  })

  const logMock = getLogMock()

  const environment = {} as Environment
  const setOutputMock = stub(
    environment,
    "setOutput",
    async () => {
      return
    },
  )
  stub(environment, "getEventThatTriggeredThisRun", () => {
    return githubActionEventThatTriggeredTool || "push"
  })
  stub(environment, "getUserConfigurationOptions", () => {
    return {
      failOnDeployVerification: true,
      makePullRequestComment: true,
    }
  })
  const isRunningInPullRequest = githubActionEventThatTriggeredTool === "pull_request"

  const environmentIsRunningInPullRequestMock = stub(environment, "isRunningInPullRequest", () => {
    return isRunningInPullRequest
      ? {
        baseBranch: currentBranch,
        targetBranch: pullRequestTargetBranch,
        prNumber: 1,
      }
      : undefined
  })
  stub(environment, "getSimulatedMergeType", async (): Promise<"merge" | "rebase" | "squash"> => {
    return "merge"
  })

  stub(environment, "getBuild", () => {
    return {
      currentBranch,
      buildUrl: "https://example.com/build/123",
      buildId: "123",
      ciService: "github",
    }
  })
  stub(environment, "getRepository", () => {
    return { owner: "levibostian", repo: "decaf" }
  })

  // for simplicity, we return default values for these.
  stub(environment, "getBranchFilters", () => {
    return []
  })
  stub(environment, "getCommitLimit", () => {
    return 500
  })

  const prepareEnvironmentForTestMode = mock<PrepareTestModeEnvStep>()
  const prepareEnvironmentForTestModeMock = when(prepareEnvironmentForTestMode, "prepareEnvironmentForTestMode", async () => {
    if (!isRunningInPullRequest) return undefined

    return { currentGitBranch: pullRequestTargetBranch, commitsCreatedDuringSimulatedMerges: commitsCreatedBySimulatedMerge || [] }
  })

  const gitMock = mock<Git>()
  const execMock = mock<Exec>()

  await run({
    convenienceStep,
    stepRunner,
    prepareEnvironmentForTestMode,
    getCommitsSinceLatestReleaseStep,
    log: logMock,
    git: gitMock,
    exec: execMock,
    environment,
  })

  return {
    runGetLatestOnCurrentBranchReleaseStepMock,
    getCommitsSinceLatestReleaseStepMock,
    determineNextReleaseVersionStepMock,
    deployStepMock,
    logMock,
    setOutputMock,
    environmentIsRunningInPullRequestMock,
    prepareEnvironmentForTestModeMock,
  }
}
