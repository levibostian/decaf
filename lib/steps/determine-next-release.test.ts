import { assertEquals } from "@std/assert"
import { GitHubCommit, GitHubRelease } from "../github-api.ts";
import { DetermineNextReleaseStepImpl } from "./determine-next-release.ts";
import { GitHubCommitFake, GitHubReleaseFake } from "../github-api.test.ts";
import { before, beforeEach, describe, it } from "@std/testing/bdd";
import { Logger } from "../log.ts";
import { getLogMock, LogMock } from "../log.test.ts";
import { assertSnapshot } from "@std/testing/snapshot";

const defaultEnvironment = {
  gitCurrentBranch: "main",
  lastRelease: null,
  gitCommitsSinceLastRelease: [],
  gitRepoOwner: "owner",
  gitRepoName: "repo",
  testMode: false,
};

Deno.test("given this is first release, not prerelease, expect default version", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "feat: initial commit",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      environment: defaultEnvironment,
      commits,
      latestRelease: null,
    },
  );
  assertEquals(result, "1.0.0");
});

Deno.test("given this is first release, prerelease, expect default prerelease version", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "feat: initial commit",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      config: {branches: [{branch_name: "beta", prerelease: true, version_suffix: "beta"}]},
      environment: { ...defaultEnvironment, gitCurrentBranch: "beta" },
      commits,
      latestRelease: null,
    },
  );
  assertEquals(result, "1.0.0-beta.1");
})

Deno.test("given introducing a breaking change, expect bumps major version", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "feat!: add new authentication system",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      environment: defaultEnvironment,
      commits,
      latestRelease: {
        ...GitHubReleaseFake,
        tag: { ...GitHubReleaseFake.tag, name: "1.2.3" },
      },
    },
  );
  assertEquals(result, "2.0.0");
});

Deno.test("given a feature commit, expect bumps minor version", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "feat: add new feature",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      environment: defaultEnvironment,
      commits,
      latestRelease: {
        ...GitHubReleaseFake,
        tag: { ...GitHubReleaseFake.tag, name: "1.2.3" },
      },
    },
  );
  assertEquals(result, "1.3.0");
});

Deno.test("given a fix commit, expect bumps patch version", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "fix: resolve issue with login",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      environment: defaultEnvironment,
      commits,
      latestRelease: {
        ...GitHubReleaseFake,
        tag: { ...GitHubReleaseFake.tag, name: "1.2.3" },
      },
    },
  );
  assertEquals(result, "1.2.4");
});

Deno.test("given a chore commit, expect no next version", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "chore: update dependencies",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      environment: defaultEnvironment,
      commits,
      latestRelease: {
        ...GitHubReleaseFake,
        tag: { ...GitHubReleaseFake.tag, name: "1.2.3" },
      },
    },
  );
  assertEquals(result, null);
});

Deno.test("given latest release is not prerelease and next release is prerelease, expect bump and add prerelease suffix", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "feat: add new feature",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      config: {branches: [{branch_name: "beta", prerelease: true, version_suffix: "beta"}]},
      environment: { ...defaultEnvironment, gitCurrentBranch: "beta" },
      commits,
      latestRelease: {
        ...GitHubReleaseFake,
        tag: { ...GitHubReleaseFake.tag, name: "1.2.3" },
      },
    },
  );
  assertEquals(result, "1.3.0-beta.1");
})

Deno.test("given latest release is prerelease, next release is prerelease, next release is major bump, expect next prerelease version with new major version", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "feat!: add new feature",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      config: {branches: [{branch_name: "beta", prerelease: true, version_suffix: "beta"}]},
      environment: { ...defaultEnvironment, gitCurrentBranch: "beta" },
      commits,
      latestRelease: {
        ...GitHubReleaseFake,
        tag: { ...GitHubReleaseFake.tag, name: "1.2.3-beta.1" },
      },
    },
  );
  assertEquals(result, "2.0.0-beta.1");
})

Deno.test("given latest version is prerelease and next release is prerelease, expect next prerelease version", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "feat: add new feature",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      config: {branches: [{branch_name: "beta", prerelease: true, version_suffix: "beta"}]},
      environment: { ...defaultEnvironment, gitCurrentBranch: "beta" },
      commits,
      latestRelease: {
        ...GitHubReleaseFake,
        tag: { ...GitHubReleaseFake.tag, name: "1.3.0-beta.1" },
      },
    },
  );
  assertEquals(result, "1.3.0-beta.2");
})

Deno.test("given latest version is prerelease and next release is not prerelease, expect next non-prelease version", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "feat: add new feature",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      config: {branches: [{branch_name: "beta", prerelease: true, version_suffix: "beta"}]},
      environment: { ...defaultEnvironment, gitCurrentBranch: "main" },
      commits,
      latestRelease: {
        ...GitHubReleaseFake,
        tag: { ...GitHubReleaseFake.tag, name: "1.3.0-beta.1" },
      },
    },
  );
  assertEquals(result, "1.3.0");
})

Deno.test("given latest version is prerelease and next release is prerelease but different suffix, expect next prerelease version with new suffix", async () => {
  const commits: GitHubCommit[] = [{
    sha: "",
    message: "feat: add new feature",
    date: new Date(),
  }];
  const result = await new DetermineNextReleaseStepImpl().getNextReleaseVersion(
    {
      config: {branches: [{branch_name: "beta", prerelease: true, version_suffix: "beta"}]},
      environment: { ...defaultEnvironment, gitCurrentBranch: "beta" },
      commits,
      latestRelease: {
        ...GitHubReleaseFake,
        tag: { ...GitHubReleaseFake.tag, name: "1.3.0-alpha.3" },
      },
    },
  );
  assertEquals(result, "1.3.0-beta.1");
})

describe("user facing logs", () => {
  let logMock: LogMock;

  beforeEach(() => {
    logMock = getLogMock()
  })

  it("given commit that does not trigger a release, expect logs to communicate this clearly", async (t) => {
    const commits: GitHubCommit[] = [new GitHubCommitFake(
      {
        message: "chore: does not trigger a release",
      }
    )];
    await new DetermineNextReleaseStepImpl(logMock).getNextReleaseVersion({
        environment: defaultEnvironment,
        commits,
        latestRelease: null,
      },
    );
    await assertSnapshot(t, logMock.getLogs({includeDebugLogs: false}));
  });

  it("given super long commit messages, expect logs to not be super long", async (t) => {
    const commitMessage = "feat: " + "a".repeat(1000);
    const commits: GitHubCommit[] = [new GitHubCommitFake(
      {
        message: commitMessage,
      }
    )];
    await new DetermineNextReleaseStepImpl(logMock).getNextReleaseVersion({
        environment: defaultEnvironment,
        commits,
        latestRelease: null,
      },
    );
    await assertSnapshot(t, logMock.getLogs({includeDebugLogs: false}));
  });

  it("given commit message multiple lines long, expect logs to not be super long", async (t) => {
    const commitMessage = "feat: " + "a\n".repeat(1000);
    const commits: GitHubCommit[] = [new GitHubCommitFake(
      {
        message: commitMessage,
      }
    )];
    await new DetermineNextReleaseStepImpl(logMock).getNextReleaseVersion({
        environment: defaultEnvironment,
        commits,
        latestRelease: null,
      },
    );
    await assertSnapshot(t, logMock.getLogs({includeDebugLogs: false}));
  });

  it("given many commits, expect logs to read them all nicely", async (t) => {
    const commits: GitHubCommit[] = [
      new GitHubCommitFake({message: "feat: add new feature"}),
      new GitHubCommitFake({message: "fix: resolve issue"}),
      new GitHubCommitFake({message: "chore: update dependencies"}),
    ];
    await new DetermineNextReleaseStepImpl(logMock).getNextReleaseVersion({
        environment: defaultEnvironment,
        commits,
        latestRelease: null,
      },
    );
    await assertSnapshot(t, logMock.getLogs({includeDebugLogs: false}));
  })
})
