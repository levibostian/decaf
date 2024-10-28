import { GetLatestReleaseStep } from "./lib/steps/get-latest-release.ts";
import {Logger} from "./lib/log.ts";
import { DeployStep } from "./lib/steps/deploy.ts";
import { GetCommitsSinceLatestReleaseStep } from "./lib/steps/get-commits-since-latest-release.ts";
import { DetermineNextReleaseStep } from "./lib/steps/determine-next-release.ts";
import { CreateNewReleaseStep } from "./lib/steps/create-new-release.ts";
import {DeployEnvironment, GetNextReleaseVersionEnvironment} from "./lib/types/environment.ts";
import { GitHubActions } from "./lib/github-actions.ts";

export const run = async ({
  getLatestReleaseStep,
  getCommitsSinceLatestReleaseStep,
  determineNextReleaseStep,
  deployStep,
  createNewReleaseStep,
  githubActions,
  log,
}: {
  getLatestReleaseStep: GetLatestReleaseStep;
  getCommitsSinceLatestReleaseStep: GetCommitsSinceLatestReleaseStep;
  determineNextReleaseStep: DetermineNextReleaseStep;
  deployStep: DeployStep;
  createNewReleaseStep: CreateNewReleaseStep;
  githubActions: GitHubActions;
  log: Logger;
}): Promise<void> => {
  // Parse the configuration set by the user first so we can fail early if the configuration is invalid. Fast feedback for the user. 
  // Have the function throw if the JSON parsing fails. it will then exit the function. 
  const determineNextReleaseStepConfig = githubActions.getDetermineNextReleaseStepConfig();
  log.debug(`determine next release step config: ${JSON.stringify(determineNextReleaseStepConfig)}`);

  log.notice(`👋 Hello! I am a tool called new-deployment-tool. I help you deploy your projects.`);
  log.message(
    `To learn how the deployment process of your project works, I suggest reading all of the logs that I print to you below.`,
  );
  log.message(
    `If you have more questions after reading the logs, you can optionally view the documentation to learn more about the tool: https://github.com/levibostian/new-deployment-tool/`,
  );
  log.message(`Ok, let's get started with the deployment!`);
  log.message(`--------------------------------`);

  const githubRef = Deno.env.get("GITHUB_REF")!;
  log.debug(`GITHUB_REF: ${githubRef}`);
  const currentBranch = githubRef.replace("refs/heads/", "");
  log.debug(`name of current git branch: ${currentBranch}`);
  const isDryRunMode = Deno.env.get("DRY_RUN") === "true";
  if (isDryRunMode) {
    log.warning(
      `Dry run mode is enabled. This means that I will not actually deploy anything. I will only print out what I would do if I were to deploy.`,
    );
  }

  // example value for GITHUB_REPOSITORY: "denoland/deno"
  const githubRepositoryFromEnvironment = Deno.env.get("GITHUB_REPOSITORY")!;
  const [owner, repo] = githubRepositoryFromEnvironment.split("/");
  log.debug(
    `github repository executing in: ${githubRepositoryFromEnvironment}. owner: ${owner}, repo: ${repo}`,
  );

  log.notice(`👀 I see that the git branch ${currentBranch} is checked out. We will begin the deployment process from the latest commit of this branch.`);

  log.notice(
    `🔍 First, I need to get the latest release that was created on the git branch ${currentBranch}. I'll look for it now...`,
  );

  const lastRelease = await getLatestReleaseStep.getLatestReleaseForBranch({
    owner,
    repo,
    branch: currentBranch,
  });
  log.debug(`Last release found on github releases: ${lastRelease?.tag.name}`);

  if (!lastRelease) {
    log.message(
      `Looks like the branch ${currentBranch} has never been released before. This will be the first release. Exciting!`,
    );
  } else {
    log.message(
      `Looks like the latest release on the git branch ${currentBranch} is: ${lastRelease.tag.name}`,
    );
  }

  log.notice(
    `📜 Next, I need to know all of the changes (git commits) that have been done on git branch ${currentBranch} since the latest release of ${lastRelease?.tag.name}. I'll look for them now...`,
  );

  const listOfCommits = await getCommitsSinceLatestReleaseStep
    .getAllCommitsSinceGivenCommit({
      owner,
      repo,
      branch: currentBranch,
      latestRelease: lastRelease,
    });
  if (listOfCommits.length === 0) {
    log.warning(
      `Looks like zero commits have been created since the latest release. This means there is no new code created and therefore, the deployment process stops here. Bye-bye 👋!`,
    );
    return;
  }
  let newestCommit = listOfCommits[0];
  log.debug(`Newest commit found: ${JSON.stringify(newestCommit)}`);
  log.debug(
    `Oldest commit found: ${
      JSON.stringify(listOfCommits[listOfCommits.length - 1])
    }`,
  );
  log.message(`I found ${listOfCommits.length} git commits created since ${lastRelease ? `the latest release of ${lastRelease.tag.name}` : `the git branch ${currentBranch} was created`}.`);

  log.notice(
    `📊 Now I need to know (1) if any of these new commits need to be deployed and (2) if they should, what should the new version be. To determine this, I will analyze each git commit one-by-one...`,
  );

  const determineNextReleaseVersionEnvironment: GetNextReleaseVersionEnvironment = {
    gitCurrentBranch: currentBranch,
    gitRepoOwner: owner,
    gitRepoName: repo,
    isDryRun: isDryRunMode,
    gitCommitsSinceLastRelease: listOfCommits,
    lastRelease,
  };

  const nextReleaseVersion = await determineNextReleaseStep
    .getNextReleaseVersion({
      config: determineNextReleaseStepConfig,
      environment: determineNextReleaseVersionEnvironment,
      commits: listOfCommits,
      latestRelease: lastRelease,
    });

  if (!nextReleaseVersion) {
    log.warning(
      `After analyzing all of the git commits, none of the commits need to be deployed. Therefore, the deployment process stops here with no new release to be made. Bye-bye 👋!`,
    );
    return;
  }
  log.message(
    `After analyzing all of the git commits, I have determined the next release version will be: ${nextReleaseVersion}`,
  );

  log.notice(`🚢 It's time to ship ${nextReleaseVersion}! I will now run all of the deployment commands provided in your project's configuration file...`);

  const deployEnvironment: DeployEnvironment = {...determineNextReleaseVersionEnvironment, nextVersionName: nextReleaseVersion};

  const gitCommitCreated = await deployStep.runDeploymentCommands({
    environment: deployEnvironment,
  });
  if (gitCommitCreated) {
    newestCommit = gitCommitCreated;
  }

  log.notice(
    `✏️ The code has been shipped. The final piece of the deployment process is creating a new release on GitHub for the new version, ${nextReleaseVersion}. Creating that now...`,
  );
  if (isDryRunMode) {
    log.warning(
      `Dry run mode is enabled. I would have created a new release on GitHub with the new version: ${nextReleaseVersion}`,
    );
    return;
  }
  await createNewReleaseStep.createNewRelease({
    owner,
    repo,
    tagName: nextReleaseVersion,
    commit: newestCommit,
  });

  log.message(
    `New release has been created on GitHub. View the release: https://github.com/${owner}/${repo}/releases/${nextReleaseVersion}`, 
  );

  log.notice(
    `🎉 Congratulations! The deployment process has completed. Bye-bye 👋!`, 
  );

  githubActions.setOutput({key: "new_release_version", value: nextReleaseVersion});
};
