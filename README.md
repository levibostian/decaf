# decaf

Simple, calm, and flexible tool to automate your project's deployments. 

**No more coffee breaks to deploy your code.**

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
      - uses: levibostian/decaf@<version>
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }} # See "GitHub Authentication" section for token requirements
          get_latest_release_current_branch: python scripts/get_latest_release.py
          get_next_release_version: python scripts/get_next_release.py
          deploy: python scripts/deploy.py
```

> Note: Replace `<version>` with the version of the tool you want to use. You can find the latest version on the [GitHub releases page](https://github.com/levibostian/decaf/releases).

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
            curl -fsSL https://github.com/levibostian/decaf/blob/HEAD/install?raw=true | bash "1.0.0"

            # To always install the latest version (not recommended for teams):
            # curl -fsSL https://github.com/levibostian/decaf/blob/HEAD/install?raw=true | bash
      - run:
          name: Run CLI Tool
          command: |
            # You must provide a GitHub personal access token (PAT).
            # See the "GitHub Authentication" section in the README for detailed permission requirements.
            ./decaf \
              --github_token "$GH_TOKEN" \
              --deploy "./steps/deploy.ts" \
              --get_latest_release_current_branch "./steps/get-latest-release.ts" \
              --get_next_release_version "./steps/get-next-release.ts" \
              --simulated_merge_type "rebase" \
              --make_pull_request_comment false              
            # --make_pull_request_comment true # Enable this if you want PR comments (requires pull-requests:write)
```

## Running multiple commands per step

You can provide multiple commands for the `deploy`, `get_latest_release_current_branch`, and `get_next_release_version` steps.

**Execution behavior**

If you do run multiple commands, the execution behavior differs per step: 

- **`get_latest_release_current_branch` and `get_next_release_version`** steps: Commands execute sequentially until one command returns valid output, then stops
  - **Order matters!** List commands from most preferred to least preferred
  - Useful for fallback strategies (e.g., try GitHub API first, fall back to git tags)
- **`deploy`** step: All commands execute sequentially, regardless of success or failure of previous commands, and does not exit early. 

Ok, now here are examples of how to run multiple commands per step:

**GitHub Actions example:**
```yaml
- uses: levibostian/decaf@<version>
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    # Deploy: all commands run
    deploy: |
      npm run build
      npm run test
      python scripts/deploy.py
    # Get latest release: stops at first valid output
    get_latest_release_current_branch: |
      python scripts/check-github-releases.py
      python scripts/fallback-git-tags.py
```

**CLI example:**
```bash
./decaf \
  --github_token "$GH_TOKEN" \
  --deploy "npm run build" \
  --deploy "npm run test" \
  --deploy "python scripts/deploy.py" \
  --get_latest_release_current_branch "python scripts/check-github-releases.py" \
  --get_latest_release_current_branch "python scripts/fallback-git-tags.py"
```

**You could use &&, but be careful**

If you want to be a bash nerd, instead of using separate commands, as explained above, you can use bash's `&&` and `;` operators to chain commands together in a single command string:

```bash
./decaf \
  --deploy "npm run build && npm run test && python scripts/deploy.py" 
```

But be careful! After each command executes, decaf will check the output of the command to see if it gave output. If you use `&&` to run multiple commands where both commands produce output, only the output of the last command will be seen by decaf! 

# Write your step scripts

You are responsible for writing the scripts that perform each deployment step. This includes determining the next version, updating the version number in metadata files, and pushing code to a server. You can use *any* language or tools you prefer 😍!

> **💡 Pro tip:** Use the [decaf SDK](https://github.com/levibostian/decaf-sdk-deno/) to make writing your step scripts easier! The SDK provides helpful utilities and handles the input/output contract for you. It supports Deno, Node.js, and Bun.

> **💡 Testing your scripts:** Want to write automated tests for your deployment scripts? Check out the [testing guide](docs/test-your-scripts.md) to learn strategies and tools for testing your scripts.

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

# GitHub Authentication

All CI providers require you to provide a GitHub token via the `github_token` input. This token is used to interact with the GitHub API for various operations.

## Token Types

You can use either a classic GitHub personal access token (PAT) or a fine-grained PAT. **Fine-grained tokens are recommended** and work perfectly with this project.

## Required Permissions

Different features require different permission levels:

### Minimum permissions (required for basic functionality)
- **Contents: Read** - Required for the tool to function at all

### Additional permissions for specific features
- **Pull Requests: Read & Write** - Required if you enable the pull request comments feature (enabled by default via `make_pull_request_comment` config)
- **Contents: Write** - Required in two scenarios:
  1. If your deployment script pushes commits, creates tags, or creates GitHub Releases
  2. If you want the automatic simulated merge type detection feature to work (only needed if you don't provide the `simulated_merge_type` input)

# Outputs

After the tool runs, you can access data about what happened during the deployment. The tool provides the following output keys:

| Key | Value | When Set |
|-----|-------|----------|
| `test_mode_on` | `"true"` or `"false"` | Always set. Indicates if the tool ran in test mode or real deployment mode. |
| `new_release_version` | Version string (e.g. `"1.2.4"`) or not set | Set only if a new release was created. Contains the version number of the release. |
| `new_release_version_simulated_merge` | Version string (e.g. `"1.2.4"`) or not set | Set only in test mode when simulating a merge commit. Contains the version that would be released if you merge. |
| `new_release_version_simulated_squash` | Version string (e.g. `"1.2.4"`) or not set | Set only in test mode when simulating a squash commit. Contains the version that would be released if you squash and merge. |
| `new_release_version_simulated_rebase` | Version string (e.g. `"1.2.4"`) or not set | Set only in test mode when simulating a rebase commit. Contains the version that would be released if you rebase and merge. |

**Accessing outputs in GitHub Actions:**
```yaml
- uses: levibostian/decaf@<version>
  id: deployment
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    # ... rest of your config

- name: Use outputs
  run: |
    echo "New version: ${{ steps.deployment.outputs.new_release_version }}"
    echo "Test mode: ${{ steps.deployment.outputs.test_mode_on }}"
```

**Accessing outputs in other CI systems (CircleCI, Jenkins, GitLab CI, etc.):**

Add the `output_file` parameter to write outputs to a JSON file:
```bash
./decaf \
  --github_token "$GH_TOKEN" \
  --deploy "./steps/deploy.ts" \
  --get_latest_release_current_branch "./steps/get-latest-release.ts" \
  --get_next_release_version "./steps/get-next-release.ts" \
  --output_file "./deployment-output.json"

# Read outputs from the JSON file
NEW_VERSION=$(cat deployment-output.json | jq -r '.new_release_version')
echo "Deployed version: $NEW_VERSION"
```


# Configuration 

Customize this tool to work as you wish. 

### Create pre-release versions

See [get next release version](steps/get-next-release/README.md) for more information on how to create pre-release versions.

### Test mode for multiple different merge types 

Test mode allows you to test your deployment in a pull request before you merge. It will tell you what will happen if you do decide to merge. 

In order to do this, decaf needs to know what type of merge you plan on doing (merge, squash, rebase). By default, decaf will call the GitHub API to see what merge types are enabled in the repository settings and run test mode for all of the enabled merge types. If decaf can't authenticate with the GitHub API, it will default to simulating all 3 merge types.

If you would rather explicitly tell decaf what type of merge to simulate, you can provide the `simulated_merge_type` config setting. 

```yml
    steps:
    - uses: actions/checkout
    - uses: levibostian/decaf
      with: 
        simulated_merge_type: 'merge, squash' # provide single values or multiple values separated by commas
        # ... Put rest of your config here. 
```

### Customize pull request comments

By default, the tool posts a comment to pull requests showing deployment preview information. You can customize this comment using your own template.

**Example:**
```yaml
- uses: levibostian/decaf@<version>
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    # Use 1 of these 2 options to customize the PR comment:
    # 1. Provide a path to a markdown file containing your template
    pull_request_comment_template_file: "./decaf-pr-comment-template.md"
    # 2. Provide the template directly in the config file
    pull_request_comment_template: |
      ## decaf deployment results 
      If this pull request is merged using the specified merge method, the deployment results will be as follows:{{ for result of results }}
      {{ if (result.status === "success") }}
      {{ if (result.nextReleaseVersion) }}✅**{{ result.mergeType }}**... 🚢 The next version of the project will be: **{{ result.nextReleaseVersion }}**{{ else }}✅**{{ result.mergeType }}**... 🌴 It will not trigger a deployment. No new version will be deployed.{{ /if }}
      {{ else }}✅**{{ result.mergeType }}**... ⚠️ There was an error during deployment run.{{ if (build.buildUrl) }} [See logs to learn more and fix the issue]({{ build.buildUrl }}).{{ else }} See CI server logs to learn more and fix the issue.{{ /if }}
      {{ /if }}
      {{ /for }}
```

Templates use [VentoJS](https://vento.js.org/) syntax and have access to deployment data including `results` (array of simulation results), `pullRequest` (PR info), `repository` (repo info), and `build` (CI info). See [the template data interface](lib/pull-request-comment.ts) for all available variables.

**Disable comments:**
```yaml
make_pull_request_comment: false
```

### Performance optimization for large repositories

If you have a large repository (many branches and/or commits), the tool may run slowly with the default configuration. Here are optional settings to improve performance:

**Branch filtering (`branch_filters`)**
By default, the tool analyzes commits from all local branches. If you have many branches, you can filter which branches to include using glob patterns:

```bash
# Only analyze main and develop branches
--branch_filters "main,develop"

# Analyze branches matching patterns
--branch_filters "main,feature/*,release/*"

# Complex patterns with braces
--branch_filters "main,{feature,bugfix}/*,release-*"
```

The fewer branches that match your filters, the faster the tool will run.

**Commit limit (`commit_limit`)**
By default, the tool looks at the last 500 commits per branch. If you deploy frequently, you may not need to look back that far:

```bash
# Only look at last 100 commits per branch
--commit_limit 100

# For very frequent deployments
--commit_limit 50
```

The smaller the number, the faster the tool will run.

**Example optimized configuration:**
```yml
- uses: levibostian/decaf@<version>
  with:
    branch_filters: "main,develop"
    commit_limit: 100
    # ... rest of your config
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

# Troubleshooting

If you encounter issues while using decaf, the best place to start is by viewing the tool's debug logs. These debug logs are intended to be helpful only if there are issues with the decaf tool itself, not identifying issues with your step scripts you write. It's highly recommended to add logging to your step scripts and/or write automated tests against your step scripts to ensure they work as expected. 

## Getting Debug Logs

### GitHub Actions

Re-run with debug logging enabled:

1. Go to your failed workflow run in GitHub Actions
2. Click "Re-run jobs" and select "Re-run jobs with debug logging"  
3. The debug information will be displayed directly in the workflow logs

### Other CI Providers

Enable debug logging by setting the `--debug` flag to `true`:

```bash
./decaf \
  --github_token "$GH_TOKEN" \
  --deploy "./steps/deploy.ts" \
  --get_latest_release_current_branch "./steps/get-latest-release.ts" \
  --get_next_release_version "./steps/get-next-release.ts" \
  --debug true
```

# Development

When developing, it's recommended to write automated tests and run them to
verify the tool works. We also suggest running the tool on a real github
repository that is not a production app of yours to verify that the tool works as expected.

# Tests

`deno task test` will run the test suite for this tool. 

When you create a pull request, the tool will run in test mode to verify that the tool works as expected.
