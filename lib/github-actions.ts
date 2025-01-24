import { DetermineNextReleaseStepConfig } from "./steps/determine-next-release.ts";
import * as log from './log.ts';
import * as githubActions from 'npm:@actions/core';

export interface GitHubActions {
  getNameOfCurrentBranch(): string;
  getDetermineNextReleaseStepConfig(): DetermineNextReleaseStepConfig | undefined;
  getSimulatedMergeType(): 'merge' | 'rebase' | 'squash';
  getEventThatTriggeredThisRun(): 'push' | 'pull_request' | unknown;
  isRunningInPullRequest(): Promise<{baseBranch: string, targetBranch: string, prTitle: string, prDescription: string} | undefined>
  setOutput({key, value}: {key: string, value: string}): void;
}

export class GitHubActionsImpl implements GitHubActions {
  getNameOfCurrentBranch(): string {
    const githubRef = Deno.env.get("GITHUB_REF")!;    
    log.debug(`GITHUB_REF: ${githubRef}`);

    // if the ref starts with "refs/pull/", then it's a pull request. 
    // the tool is only compatible with branch names that start with "refs/heads/".
    // We need a different way to get the branch name.
    if (githubRef.startsWith("refs/pull/")) { 
      const githubHeadRef = Deno.env.get("GITHUB_HEAD_REF")!;
      log.debug(`GITHUB_HEAD_REF: ${githubHeadRef}`);
      return githubHeadRef;
    }

    return githubRef.replace("refs/heads/", "");
  }

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

  getSimulatedMergeType(): 'merge' | 'rebase' | 'squash' {
    const githubActionInputKey = "simulated_merge_type";

    const simulateMergeType = this.getInput(githubActionInputKey);
    if (!simulateMergeType) {
      return 'merge';
    }

    if (simulateMergeType !== 'merge' && simulateMergeType !== 'rebase' && simulateMergeType !== 'squash') {
      log.error(`The value for the GitHub Actions input ${githubActionInputKey} is invalid. The value must be either "merge", "rebase", or "squash". The value provided was: ${simulateMergeType}`);

      throw new Error();
    }

    return simulateMergeType;
  }

  getEventThatTriggeredThisRun(): 'push' | 'pull_request' | string {
    const eventName = Deno.env.get("GITHUB_EVENT_NAME");

    switch (eventName) {
      case "push":
        return "push";
      case "pull_request":
        return "pull_request";
      default:
        return eventName || "unknown";
    }
  }

  async isRunningInPullRequest(): Promise<{ baseBranch: string; targetBranch: string; prTitle: string; prDescription: string} | undefined> {
    const githubEventName = Deno.env.get("GITHUB_EVENT_NAME");
    if (githubEventName !== "pull_request") {
      return undefined;
    }

    // object reference: https://docs.github.com/en/webhooks/webhook-events-and-payloads?actionType=opened#pull_request
    const pullRequestContext = await this.getFullRunContext()!; // we can force since we know we are in a pull request event    

    const eventData = pullRequestContext.pull_request;
    
    return {
      baseBranch: eventData.head.ref,
      targetBranch: eventData.base.ref,
      prTitle: eventData.title,
      prDescription: eventData.body || '' // github body can be null, we want a string.
    };
  }

  setOutput({key, value}: {key: string, value: string}): void {
    githubActions.setOutput(key, value);
  }

  private async getFullRunContext(): Promise<any | undefined> {
    const eventPath = Deno.env.get("GITHUB_EVENT_PATH");
    if (eventPath) {
      const fileContents = new TextDecoder("utf-8").decode(Deno.readFileSync(eventPath));
      return JSON.parse(fileContents);
    }
  }

  private getInput(key: string): string {
    return githubActions.getInput(key);
  }
}