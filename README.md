# new-deployment-tool

Simple, calm, and flexible tool to automate your project's deployments. 

> [!WARNING] 
> This tool is early on in development and will likely introduce breaking 
> changes as it reaches a 1.0 release. Be prepared to manually update through 
> each version. 

### Why use this tool? 

1. **Learn in a couple of minutes** - New engineer onboarding on your team? Send
   them the logs of your last deployment and that should be enough to teach them
   how to use the tool.
2. **Flexible** - No matter what type of project your team is deploying. No
   matter what language your team is comfortable with. You can use this tool.
   Everything can be customized to your preferred workflow.
3. **Calm deployments** - When you install this tool in your project, you should
   not be scared to run it in fear something bad will happen. Test your
   configuration & fail gracefully with this tool.

> [!WARNING] 
> This tool is early on in development and some of the bullet points above have 
> not been fully developed yet. Your feedback is always welcome throughout development! 

# How does this tool work? 

You might be wondering, *What do you mean you can automate a deployment?* An automated deployment means that all you need to do to deploy your code is merge a pull request and that's it. The entire deployment process will be done for you in the background while you move onto other tasks of your project. 

Think of all the steps that you do to deploy your code. Some examples might be...
* Bump the semantic version of your software to the next major, minor, or patch version. 
* Update metadata files with the new version. 
* Push the code to deployment server. 
* Create git tag and GitHub Release with the new version. 

This tool automates all of these steps for you each time you merge your code. You just need to write the scripts that perform each step, and the tool will run them in order. 

# Getting started

Just follow these 3 steps. 

1. [Install the tool](#install-the-tool)
2. [Write your step scripts](#write-your-step-scripts)
3. [Push git commits to your deployment branch](#push-git-commits-with-the-correct-pr-message)

# Install the tool

You can install and run the tool in two ways:

## 1. GitHub Actions

Here is an example workflow file to install and run the tool in your project. Read the comments to learn about the requirements for setting up the project. 

```yaml
# In your project, what branch do you merge code into when it's ready to ship?
# Replace 'main' below with the branch your project uses.
on:
  push: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      # Required permissions for the tool to run: 
      # By default, this tool only needs read permissions to the repository.
      # contents: read
      # pull-requests: read

      # For most projects, these are the permissions you want to grant: 
      contents: write # If your deploy script that you write needs to push a git commit, git tag, or create a GitHub Release.
      pull-requests: write # If you enable pull request comments (they are enabled by default).
    steps:
      - uses: actions/checkout@v4
      
      # This block installs the tool and configures it for your project. 
      - uses: levibostian/new-deployment-tool@<version>
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          get_latest_release_current_branch: python scripts/get_latest_release.py
          get_next_release_version: python scripts/get_next_release.py
          deploy: python scripts/deploy.py
```

> Note: Replace `<version>` with the version of the tool you want to use. You can find the latest version on the [GitHub releases page](https://github.com/levibostian/new-deployment-tool/releases).

> Reminder: You must provide a script for each step. The tool will execute your scripts in order and expects them to follow the input/output contract described below.

## 2. CLI Usage (Any CI/CD, e.g., CircleCI)

You can run the tool as a standalone CLI in any environment. This is useful for CircleCI, Azure devops, whatever CI service you want! [This is the list of CI services this tool supports](https://github.com/semantic-release/env-ci#supported-ci). 

> Note: Some of the CI services have not been tested yet, so please report any issues you find.

```yaml
# Example CircleCI config for running the deployment tool as a CLI
jobs:
  build:
    machine:
      image: ubuntu-2404:2024.11.1 
    steps:
      - checkout # Check out your code
      - run:
          name: Install CLI Tool
          command: |
            # Install a specific version of the tool (recommended for teams)
            curl -fsSL https://github.com/levibostian/new-deployment-tool/blob/HEAD/install?raw=true | bash "1.0.0"

            # To always install the latest version (not recommended for teams):
            # curl -fsSL https://github.com/levibostian/new-deployment-tool/blob/HEAD/install?raw=true | bash
      - run:
          name: Run CLI Tool
          command: |
            # You must provide a GitHub personal access token (PAT) with the required permissions.
            # The minimum required is contents:read, pull-requests:read. 
            # If your deployment step pushes tags, commits, or creates releases, you need contents:write.
            # If you want PR comments in test mode, you also need pull-requests:write.
            ./new-deployment-tool \
              --github_token "$GH_TOKEN" \
              --deploy "./steps/deploy.ts" \
              --get_latest_release_current_branch "./steps/get-latest-release.ts" \
              --get_next_release_version "./steps/get-next-release.ts" \
              --simulated_merge_type "rebase" \
              --make_pull_request_comment false              
            # --make_pull_request_comment true # Enable this if you want PR comments (requires pull-requests:write)
```

# Write your step scripts

You are responsible for writing the scripts that perform each deployment step. This includes determining the next version, updating the version number in metadata files, and pushing code to a server. You can use *any* language or tools you prefer 😍!

Below are instructions for each required step. The `steps/` directory in this repository contains example scripts for deploying this codebase, but you should write your own scripts for your project. Use the examples only for reference.

### 1. Get latest release

Write a script that determines the current/latest release version of your project.

**Requirements:**
- Read input from the JSON file at the path provided by the `DATA_FILE_PATH` environment variable. Input format:
  ```json
  {
    "gitCurrentBranch": "main",
    "gitRepoOwner": "your-org",
    "gitRepoName": "your-repo",
    "testMode": false
  }
  ```
- Output the latest release version as JSON to the same file path. Output format:
  ```json
  {
    "versionName": "1.2.3",
    "commitSha": "abc123..."
  }
  ```

**Example Node.js script:**
```js
// get-latest-release.js
const fs = require('fs');
const path = process.env.DATA_FILE_PATH;
const input = JSON.parse(fs.readFileSync(path, 'utf8'));

// TODO: Replace with your logic to get the latest release version and commit SHA
const latestRelease = {
  versionName: '1.2.3', // The latest version string
  commitSha: 'abc123...' // The commit SHA for the release
};

// Write the output JSON to the same file
fs.writeFileSync(path, JSON.stringify(latestRelease));
```

### 2. Get next release version

Write a script that determines what the next release version should be (e.g., bumping major, minor, or patch).

**Requirements:**
- Read input from the JSON file at the path provided by the `DATA_FILE_PATH` environment variable. Input format:
  ```json
  {
    "gitCurrentBranch": "main",
    "gitRepoOwner": "your-org",
    "gitRepoName": "your-repo",
    "testMode": false,
    "lastRelease": { "versionName": "1.2.3", "commitSha": "abc123..." },
    "gitCommitsSinceLastRelease": [
      { "sha": "def456...", "message": "feat: add new feature", "date": "2024-01-01T00:00:00Z" }
      // ...more commits
    ]
  }
  ```
- Output the next release version as JSON to the same file path. Output format:
  ```json
  {
    "version": "1.2.4"
  }
  ```

**Example Node.js script:**
```js
// get-next-release.js
const fs = require('fs');
const path = process.env.DATA_FILE_PATH;
const input = JSON.parse(fs.readFileSync(path, 'utf8'));

// TODO: Replace with your logic to determine the next version (e.g., using commit messages)
const nextVersion = {
  version: '1.2.4' // The next version string
};

// Write the output JSON to the same file
fs.writeFileSync(path, JSON.stringify(nextVersion));
```

### 3. Deploy

Write a script that performs the deployment.

**Requirements:**
- Read input from the JSON file at the path provided by the `DATA_FILE_PATH` environment variable. Input format:
  ```json
  {
    "gitCurrentBranch": "main",
    "gitRepoOwner": "your-org",
    "gitRepoName": "your-repo",
    "testMode": false,
    "lastRelease": { "versionName": "1.2.3", "commitSha": "abc123..." },
    "gitCommitsSinceLastRelease": [ /* ... */ ],
    "nextVersionName": "1.2.4"
  }
  ```
- Perform your deployment logic (update metadata files, push to server, etc.).
- There are no specific output requirements for this step. 

**Example Node.js script:**
```js
// deploy.js
const fs = require('fs');
const path = process.env.DATA_FILE_PATH;
const input = JSON.parse(fs.readFileSync(path, 'utf8'));

// TODO: Replace with your deployment logic (update files, push to server, etc.)
```

> Tip: The tool will verify that the latest release version is updated after deployment. If the deployment does not result in a new release, the workflow will fail (unless you set `fail_on_deploy_verification: false`).

# Push git commits with the correct PR message

Some git commits that you push to your deployment branch should be released (features, bug fixes), and some git commits should not be released (docs changes, adding new tests, refactors). You tell the tool if a deployment should be done by formatting your git commit message in a specific format called [conventional commits](https://www.conventionalcommits.org). 

If your team is not used to using a special format for git commit messages, you may find [this tool useful](https://github.com/levibostian/action-conventional-pr-linter) to lint pull requests before you click *Squash and merge* and perform a deployment. 

🎊 Congrats! You're all setup for automated deployments! 

*Tip:* We suggest checking out [how to create pre-production releases](#create-prerelease-versions) to see if this is something you're interested in. 

# Outputs 

This tool provides you with outputs to help you understand what happened during the deployment process.

* `new_release_version` - If a new release was created, this is the version of that release.
* `test_mode_on` - If test mode was on when the tool ran. Value is string values "true" or "false".

# Configuration 

Customize this tool to work as you wish. 

### Create pre-release versions

See [get next release version](steps/get-next-release/README.md) for more information on how to create pre-release versions.

### Test mode for multiple different merge types 

Test mode allows you to test your deployment in a pull request before you merge. It will tell you what will happen if you do decide to merge. To run in test mode, you must tell the tool what type of merge you plan on doing (merge, squash, rebase). But what if your team uses multiple different merge types? You can run the tool multiple times in test mode to test each merge type.

To do this, it's as easy as running the tool multiple times in the same workflow file. Here is an example of how to do this: 

```yml
    steps:
    # You must run checkout before running the tool each time. It resets the git history for the tool to run accurately.
    - uses: actions/checkout@v4
    - uses: levibostian/new-deployment-tool@main
      with: 
        simulated_merge_type: 'merge'
        # ... Put rest of your config here. 
    - uses: actions/checkout@v4
    - uses: levibostian/new-deployment-tool@main
      with: 
        simulated_merge_type: 'squash'
        # ... Put rest of your config here. 

    - uses: actions/checkout@v4
    - uses: levibostian/new-deployment-tool@main
      with: 
        simulated_merge_type: 'rebase'
        # ... Put rest of your config here.  
```

# Why create this tool?

I love tools such as
[semantic-release](https://github.com/semantic-release/semantic-release) to
automate code deployments. I have been using that tool in particular for over 5
years now and I do not want to go back to manual deployments. From my experience
working with this tool on individual and team projects, I have witnessed stress
and frustration in certain situations when this tool (as well as similar tools)
fall short. Taking my experience using this tool, reading the source code, and
interacting with the community, I decided to try and build something better.

# Development

When developing, it's recommended to write automated tests and run them to
verify the tool works. We also suggest running the tool on a real github
repository that is not a production app of yours to verify that the tool works as expected.

# Tests

`deno task test` will run the test suite for this tool. 

When you create a pull request, the tool will run in test mode to verify that the tool works as expected.
