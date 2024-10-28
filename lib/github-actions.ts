import { DetermineNextReleaseStepConfig } from "./steps/determine-next-release.ts";
import * as log from './log.ts';
import * as githubActions from 'npm:@actions/core';

export interface GitHubActions {
  getDetermineNextReleaseStepConfig(): DetermineNextReleaseStepConfig | undefined;
  setOutput({key, value}: {key: string, value: string}): void;
}

export class GitHubActionsImpl implements GitHubActions {
  getDetermineNextReleaseStepConfig(): DetermineNextReleaseStepConfig | undefined {
    const githubActionInputKey = "analyze_commits_config";

    const determineNextReleaseStepConfig = this.getInput(githubActionInputKey)
    if (!determineNextReleaseStepConfig) {
      return undefined;
    }

    try {
      // Because every property in the config is optional, if JSON.parse results in an object that is not a DetermineNextReleaseStepConfig, it's ok.
      return JSON.parse(determineNextReleaseStepConfig);
    } catch (error) {
      log.error(`When trying to parse the GitHub Actions input value for ${githubActionInputKey}, I encountered an error: ${error}`);
      log.error(`The value I tried to parse was: ${determineNextReleaseStepConfig}`);

      throw new Error();
    }
  }

  setOutput({key, value}: {key: string, value: string}): void {
    githubActions.setOutput(key, value);
  }

  private getInput(key: string): string {
    return githubActions.getInput(key);
  }
}