import { Exec, exec } from "../exec.ts";
import { GitHubCommit } from "../github-api.ts";
import * as log from "../log.ts";
import { Git } from "../git.ts";
import { DeployEnvironment } from "../types/environment.ts";

/**
 * Run the deployment commands that the user has provided in the github action workflow yaml file.
 *
 * This is the opportunity for the user to run any commands they need to deploy their project.
 * The main parts of this step:
 * 1. Run the commands the user has provided. Exit early if any fail.
 * 2. Provide data to the command and parse data that the command sends back to us.
 * 3. Add any files that the user has specified to git. We add and create a commit for them.
 * User may need to modify metadata of their project before deploying. Creating a git commit may be required to do that.
 * The tool performs all of the git operations (add, commit, push) for the user. Why?...
 * 1. The tool needs to have control over the git commit created so it can create the git tag pointing to that commit.
 * 2. Convenience for the user. No need for them to run all of these commands themselves. Including setting the author. They may forget something.
 * 3. If the user is running multiple commands for deployment, there is a chance that multiple commands create commits. That just makes this tool more complex.
 */
export interface DeployStep {
  runDeploymentCommands({ environment }: {
    environment: DeployEnvironment;
  }): Promise<GitHubCommit | null>;
}

export class DeployStepImpl implements DeployStep {
  constructor(private exec: Exec, private git: Git) {}

  async runDeploymentCommands({ environment }: {
    environment: DeployEnvironment;
  }): Promise<GitHubCommit | null> {
    // You can provide a list of commands in the github action workflow yaml file where the separator is a new line.
    // with:
    //   deploy_commands: |
    //     echo 'hello world'
    //     echo 'hello world'
    const deployCommands = Deno.env.get("INPUT_DEPLOY_COMMANDS")?.split("\n").filter(command => command.trim() !== "") ??
      [];

    for (const command of deployCommands) {
      const { exitCode, output } = await this.exec.run({ command, input: environment, displayLogs: true, throwOnNonZeroExitCode: false });

      if (exitCode !== 0) {
        log.error(
          `Deploy command, ${command}, failed with error code: ${exitCode}`,
        );
        log.error(
          `I will stop the deployment process now. Review the logs to see if this is an issue you need to fix before you retry the deployment again. Otherwise, simply retry running the deployment again later.`,
        );

        throw new Error(
          `Deploy command, ${command}, failed with error code ${exitCode}.`,
        );
      }

      // Add files to git to prepare the stage for the commit after all deployment commands have run.
      for (const file of output?.filesToCommit ?? []) {
        await this.git.add({ exec: this.exec, filePath: file });
      }
    }

    let gitCommitCreated: GitHubCommit | null = null;

    if (await this.git.areAnyFilesStaged({ exec: this.exec })) {
      log.message("There were files modified during the deployment process. Going to commit and push these changes to your GitHub repo...");

      /**
       * There is always a chance that any of the git commands will fail and will cause the deployment to fail. Any sort of failure during deployment can lead to a not calm deployment.
       * 
       * By only committing and pushing to a git branch that we control, we can make deployments safer and less prone to problems.
       * 
       * If a deployment fails, we can retry it by force pushing the branch. This will clean up the branch and give us a clean slate to try the deployment again.
       * If the deployment is successful, we can open a PR for the user to merge the changes. This way, the user can review the changes before merging them.
       */

      // The branch name that we control: 
      const deploymentBranchName = `new-deployment-tool_${environment.nextVersionName}`; 
      // We need to make sure the branch name is unique for every deployment to avoid this scenario: You deploy 1.0.0 today and then 1.1.0 tomorrow but you have not yet merged the 1.0.0 changes. If branches are not unique, the 1.1.0 deployment will overwrite the 1.0.0 deployment.
      // In the future, I think we should consider letting the user define the branch name especially since deployments like CocoaPods requires this. 

      // First part of using branches that we control is delete the existing local branch if it exists. This ensures that we have a clean slate for this deployment and prevents some git errors. 
      // If the previous deployment failed, there is a chance that the branch already exists. We want a clean slate for the deployment so we want this branch gone. 
      if (await this.git.doesLocalBranchExist({ exec: this.exec, branch: deploymentBranchName })) {
        await this.git.deleteBranch({ exec: this.exec, branch: deploymentBranchName, dryRun: environment.testMode });
      } 

      // Create and checkout the branch for the deployment. Sometimes, git will not allow you to checkout a different branch if you have changes that need committing. 
      // I am not concerned here because we have a brand new branch that just got created so git should let you switch to it.      
      await this.git.checkoutBranch({ exec: this.exec, branch: deploymentBranchName, createBranchIfNotExist: true });

      gitCommitCreated = await this.git.commit({
        exec: this.exec,
        message: `Deploy version ${environment.nextVersionName}`,
        dryRun: environment.testMode,
      });
      await this.git.push({
        exec: this.exec,
        branch: deploymentBranchName,
        forcePush: true, // if a previous deployment failed, this branch could exist on remote. Force push will cleanup remote branch. It's safe since we control this branch. 
        dryRun: environment.testMode,
      });

      log.message(`Deployment changes have been pushed to your GitHub repo. You can view the changes here: https://github.com/${environment.gitRepoOwner}/${environment.gitRepoName}/tree/${deploymentBranchName}`);
      log.message(`It's recommended to merge these changes into your default branch to avoid losing these changes.`)
    }

    return gitCommitCreated;
  }
}
