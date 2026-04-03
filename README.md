![GitHub Release](https://img.shields.io/github/v/release/levibostian/decaf?color=%236F4E37)
![Coveralls](https://img.shields.io/coverallsCoverage/github/levibostian/decaf?branch=main&color=%236F4E37)
![GitHub branch check runs](https://img.shields.io/github/check-runs/levibostian/decaf/main?color=%236F4E37)

# decaf

Simple, calm, and flexible tool to automate your project's deployments. 

**No more coffee breaks to deploy your code.**

> **Status: Pre-1.0**
> Breaking changes can occur at any time before reaching 1.0. Feel free to use 
> the tool in production, but be prepared to manually update through each 
> version and it's recommended to pin to a specific version of decaf in your CI. 
> Check the GitHub Release notes for details on each release.

## What are automated deployments?

Your entire deployment process runs on a CI server (e.g., GitHub Actions, CircleCI, etc.) each time you merge a pull request. Bumping versions, updating metadata files, compiling, pushing code to servers, creating git tags, and more, all done automatically for you.

This tool simplifies your development workflow by completely eliminating the deployment step. 

Write code -> Open pull request - > Review & merge pull request -> ~~Deploy code~~ -> Repeat.

### Highlights 

- When you open a pull request, decaf simulates merging and deploying the code so you can see what will happen before you actually merge. 
- Use any programming language you want to write your deployment scripts. 
- Every part of the deployment process is customizable to fit your workflow. 
- Works with any tech stack, any framework, anything that needs deploying.
- Optionally write automated tests for your deployment scripts to ensure they work as expected.
- Great developer experience - designed to be simple and quick to set up.
- Works with any CI/CD provider. 
- Fast. Installs in 2 seconds.
- Packaged as pre-built binaries so you know it will work today and tomorrow. 

# Getting started

Just follow these 3 steps. 

1. [Install](#install) decaf on your CI server
2. [Write your deployment scripts](#write-your-deployment-scripts)
3. [Push git commits to your deployment branch](#push-git-commits-to-your-deployment-branch)

# Install

Install decaf on your CI server using either the CLI or the GitHub Action. If you don't use GitHub Actions, use the CLI.

## GitHub Actions

Here is an example workflow file to install and run the tool in your project. Be sure to read the comments in the code snippet below for important details.

```yaml
on:
  push: [main]
  pull_request: 

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: levibostian/decaf@<version>
```

> Note: Replace `<version>` with [the latest version](https://github.com/levibostian/decaf/releases): ![GitHub Release](https://img.shields.io/github/v/release/levibostian/decaf?color=%236F4E37)

## 2. CLI

Install the CLI tool on your CI server and run it. [This is the list of CI services this tool supports](https://github.com/semantic-release/env-ci#supported-ci). 

```sh 
# Install a specific version of the tool (recommended for teams)
curl -fsSL https://github.com/levibostian/decaf/blob/HEAD/install?raw=true | bash "1.0.0"

# To always install the latest version (not recommended for teams):
curl -fsSL https://github.com/levibostian/decaf/blob/HEAD/install?raw=true | bash

~/.local/bin/decaf --args-go-here 
# dont worry about the arguments yet, we will go over them in the remaining sections
```

## Options

For both the GitHub Action and CLI, you can provide the following options to customize the tool's behavior. 

| Input | Description | Default |
|-------|-------------|---------|
| `deploy` | Command to run to deploy your project (required) | `''` |
| `github_token` | GITHUB_TOKEN or a repo scoped PAT | `${{ github.token }}` |
| `git_config` | The committer name and email address in the format `Display Name <email@address.com>`. Defaults to the GitHub Actions bot user. Tool will set this as the committer for any git operations in your deploy script. Provide an empty string for tool to not configure git. | `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>` |
| `get_latest_release_current_branch` | Command to run to get the latest release version for the current branch | `''` |
| `get_next_release_version` | Command to run to get the next release version | `''` |
| `simulated_merge_type` | When running in a pull request, what type of merge to simulate to run the tool in test mode. Options: `merge`, `squash`, `rebase`. Can be a single value or comma-separated list (e.g., `"merge,squash,rebase"`) | `''` |
| `make_pull_request_comment` | If a pull request comment should be made. Value is string values `"true"` or `"false"` | `'true'` |
| `compile_binary` | If you want to compile & run the tool instead of downloading the latest release from GitHub. This is used to test pre-release versions of the tool. Value is string values `"true"` or `"false"` | `'false'` |
| `fail_on_deploy_verification` | After deployment commands run, the tool will re-run get latest release command and compare returned version to version just deployed. This option determines if the tool should fail if the versions do not match compared to simply showing a warning. Value is string values `"true"` or `"false"`. Always `"false"` in test mode | `'true'` |
| `branch_filters` | Comma-separated list of regex patterns to filter which branches to analyze for commits. Empty string means analyze all branches (default behavior). Example: `"main,develop,feature/*,release/*"`. Branches not matching any pattern will have empty commit arrays in the input data | `''` |
| `commit_limit` | Maximum number of commits to retrieve and parse for each branch. This helps improve performance for repositories with many commits | `''` (defaults to 500) |
| `pull_request_comment_template_file` | Path to a file (relative to the repository root) containing the template for the pull request comment. If both this and `pull_request_comment_template` are provided, this takes precedence | `''` |
| `pull_request_comment_template` | Template string for the pull request comment. Used if `pull_request_comment_template_file` is not provided | `''` |
| `current_working_directory` | The working directory to run all user scripts from. If not provided, defaults to the git repository root directory | `''` | 

# Write your deployment scripts

decaf is the framework that runs your deployment process. You provide the scripts that perform each step of your deployment.

- You will write 3 scripts for each step of the decaf deployment process. Don't worry, decaf provides great input data to your scripts so they are quick and easy to write. We also have a [list of scripts the community has shared](docs/community-scripts.md) that you can use as a starting point.
- **You can choose any programming language** that you want to write your script (as long as it can read and write JSON files to the file system). 

decaf and your scripts communicate via JSON files on the file system. This is so you can write your scripts in any programming language you want.

For all scripts that you write, each of your scripts will contain the following behavior:

```javascript
// First, read the input data from decaf. 
// The path to the JSON file is provided via an environment variable: DECAF_COMM_FILE_PATH
const jsonFileContents = fileSystem.readFile(process.env.DECAF_COMM_FILE_PATH, 'utf8');
// Parse the json file into an object that you can use in your script
const input = JSON.parse(jsonFileContents);

// Next, use the input data to perform the deployment step logic you need to do.

// Finally, communicate back to decaf to writing your script's output data back to the same JSON file.
const output = { /* ... your output data ... */ };
// Write the output data as JSON to the same file path
fileSystem.writeFile(process.env.DECAF_COMM_FILE_PATH, JSON.stringify(output));
```

You will follow this pattern for all 3 of your deployment scripts. Now, let's begin to write each of the 3 required deployment scripts.

> **Writing your scripts using Node.js, Bun, or Deno?:** Use the [decaf SDK](https://github.com/levibostian/decaf-sdk-deno/) to make writing your step scripts easier! 

> Tip: Use the `current_working_directory` option to run all commands from a subdirectory (e.g., `current_working_directory: "./deployment"`). This keeps deployment scripts and dependencies separate from your application code. decaf also sets the `DECAF_ROOT_WORKING_DIRECTORY` environment variable to the root of your repository (where decaf is executed from), so you can change back to the root directory in your script. 

### Deployment script 1: Get latest release version

When you decide to fully automate your deployment process, it becomes crucial that you store the latest successful deployment of your code somewhere. This becomes your single-source-of-truth for your latest release version. You can store this information anywhere you want, as long as **it is updated as the very last step of your deployment process**. 

Some tech stacks have a requirement that you create a git tag before you can upload to their package registry. In this case, you should *not* use git tags as your single-source-of-truth, because if the deployment fails after creating the git tag, your latest release version will be incorrect. A common option for storing the single-source-of-truth is GitHub Releases. They are easy to use and you can tie them to a git tag or commit. For some projects, using npmjs.com might be enough - just as long as **the latest release version is updated as the very last step of your deployment process**.

After you decide, write your script [or reuse one of the community ones](docs/community-scripts.md). 

decaf provides your script with the following input data:

```json
{
  "gitCurrentBranch": "main",
  "gitRepoOwner": "your-org",
  "gitRepoName": "your-repo",
  "testMode": false
}
```

Your script must output the following output data: 

```json
// If your project has never been released before, provide decaf with an empty JSON object:
{}

// If your project has been released before, provide decaf with the latest release version and git commit SHA:
{
  "versionName": "1.2.3",
  "commitSha": "abc123..."
}
```

The final step is to provide decaf with the command used to run your script. Pass the `get_latest_release_current_branch` input option to decaf with the full command, just like you would run it yourself. Example: `decaf --get_latest_release_current_branch "node ./deployment-scripts/get-latest-release.js"`. 

### Deployment script 2: Get next release version

This script determines what the next version of your software should be based on the commits since the last release. You can use any versioning strategy you want (semantic versioning, calendar versioning, etc.).

When we say *based on the commits since the last release*, this is part of the magic behind automated deployments. Yes, decaf and similar tools can "automate" your deployment including updating the version, but a human is still the one who tells the tool what this new version should be by the commits that they make. 

A popular way to do this is to use [conventional commits](https://www.conventionalcommits.org) to format your git commit messages. If you are writing your commit message for a bug fix let's say, you would start the commit message with `fix:`. If you are adding a new feature, you would start the commit message with `feat:`. This script would see these special commit messages and use that information to determine what the next version should be.

You can use whatever strategy you want to determine the next version! Just some ideas that come to mind... 
- Use emojis in commit messages to indicate version bumps (e.g., 🐛 for patch, ✨ for minor, 💥 for major). 
- Use GitHub labels on pull requests to indicate version bumps. Your script can fetch pull requests when it finds a merge commit. 
- Use Jira tickets linked to a commit to determine the next version. Your script can fetch Jira ticket data when it finds a commit with a Jira ticket ID in the commit message.

decaf provides your script with the following input data:

```json
{
  "gitCurrentBranch": "main",
  "gitRepoOwner": "your-org",
  "gitRepoName": "your-repo",
  "testMode": false,
  // the data that get latest release version script outputted
  "lastRelease": {
    "versionName": "1.2.3",
    "commitSha": "abc123..."
  },
  // List of git commits since the last release. 
  // See documentation: https://github.com/levibostian/decaf/blob/main/lib/types/git.ts 
  // for description of each field in the commit object.
  "gitCommitsSinceLastRelease": [
    {
      "title": "add new feature",
      "sha": "def456...",
      "abbreviatedSha": "def456ab",
      "message": "feat: add new feature\n\nThis feature allows users to...",
      "messageLines": ["feat: add new feature", "", "This feature allows users to..."],
      "author": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "committer": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "date": "2024-01-01T00:00:00.000Z",
      "filesChanged": ["src/feature.ts", "README.md"],
      "isMergeCommit": false,
      "isRevertCommit": false,
      "parents": ["abc123..."],
      "branch": "main",
      "tags": [],
      "refs": ["HEAD -> main", "origin/main"],
      "stats": {
        "additions": 50,
        "deletions": 10,
        "total": 60
      },
      "fileStats": [
        {
          "filename": "src/feature.ts",
          "additions": 45,
          "deletions": 5
        },
        {
          "filename": "README.md",
          "additions": 5,
          "deletions": 5
        }
      ]
    }
    // ...more commits
  ]
}
```

Your script must output the following output data:

```json
// If no release should be performed, provide decaf with an empty JSON object.
// decaf will exit if this is the output.
{}

// If a release should be performed, provide decaf with the next version:
{
  "version": "1.3.0"
}
```

The final step is to provide decaf with the command used to run your script. Pass the `get_next_release_version` input option to decaf with the full command, just like you would run it yourself. Example: `decaf --get_next_release_version "node ./deployment-scripts/get-next-release.js"`.

### Deployment script 3: Deploy

This script performs the actual deployment of your software. This is where you update version numbers in files, compile your code, push to package registries, create git tags, create GitHub releases, or whatever else your deployment process requires.

decaf provides your script with the following input data:

```json
{
  "gitCurrentBranch": "main",
  "gitRepoOwner": "your-org",
  "gitRepoName": "your-repo",
  // Very important - tells you if you are running in test mode or real deployment mode
  // Highly recommended to not perform any real deployment actions if testMode is true
  "testMode": false,
  "lastRelease": {
    "versionName": "1.2.3",
    "commitSha": "abc123..."
  },
  // List of git commits since the last release. 
  // See documentation: https://github.com/levibostian/decaf/blob/main/lib/types/git.ts 
  // for description of each field in the commit object.  
  "gitCommitsSinceLastRelease": [
    {
      "title": "add new feature",
      "sha": "def456...",
      "abbreviatedSha": "def456ab",
      "message": "feat: add new feature\n\nThis feature allows users to...",
      "messageLines": ["feat: add new feature", "", "This feature allows users to..."],
      "author": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "committer": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "date": "2024-01-01T00:00:00.000Z",
      "filesChanged": ["src/feature.ts", "README.md"],
      "isMergeCommit": false,
      "isRevertCommit": false,
      "parents": ["abc123..."],
      "branch": "main",
      "tags": [],
      "refs": ["HEAD -> main", "origin/main"],
      "stats": {
        "additions": 50,
        "deletions": 10,
        "total": 60
      },
      "fileStats": [
        {
          "filename": "src/feature.ts",
          "additions": 45,
          "deletions": 5
        },
        {
          "filename": "README.md",
          "additions": 5,
          "deletions": 5
        }
      ]
    }
    // ...more commits
  ],
  // the data that get next release version script outputted
  "nextVersionName": "1.3.0"
}
```

**The deployment script is unique compared to the other 2 scripts:**
- No output is required for this script. 
- Be sure to read the `testMode` input value. If `testMode` is `true`, your script should *not* perform any real deployment actions (e.g., pushing to package registries, creating git tags, etc.). Instead, run a dry-run mode, if available, or simply log the command that would be run for you to manually verify in the logs. 
- It's **critical** that your script updates your single-source-of-truth for the latest release version *as the very last step of deployment*. This ensures that if decaf fails at any point, you can simply rerun the CI job or push a fix to your deployment scripts to re-run the deployment. 
- Write your script in a way that it can be re-run multiple times without causing issues (idempotent). If you use a package registry, chances are they do not allow you to upload the same version twice. Check if the version already exists before trying to upload. [Here is a handy tool to help you do that](https://github.com/levibostian/is-it-deployed). 

The final step is to provide decaf with the command used to run your script. Pass the `deploy` input option to decaf with the full command, just like you would run it yourself. Example: `decaf --deploy "node ./deployment-scripts/deploy.js"`. You can pass multiple commands if needed. decaf will run all commands in order they are provided. 

> Tip: The tool will verify that the latest release version is updated after deployment. If the deployment does not result in a new release, the workflow will fail (unless you set `fail_on_deploy_verification: false`).

### Open a pull request for your deployment scripts 

Now that you have written all three deployment scripts, it's time to test that they all work as expected and everything is configured correctly. As long as your CI is configured to run decaf on pull requests, decaf will run a simulated deployment in every pull request. Use this to test your new deployment scripts!

While optional, you can take simulated deployment testing a step further by writing automated tests for your deployment scripts. Check out the [test your scripts](docs/test-your-scripts.md) documentation to learn more about how to do this.

### Running multiple commands per step

You can provide multiple commands for the `deploy`, `get_latest_release_current_branch`, and `get_next_release_version` steps.

**Execution behavior**

All commands for a step always run sequentially in order — no step exits early. Scripts build on each other through a cumulative merge: the first script receives the original decaf input data, and each subsequent script receives that original input merged with every output written by all previous scripts combined. If two scripts write the same field, the later script's value wins.

For example, with two scripts for `get_latest_release_current_branch`:

```
# Script 1 receives:
#   gitCurrentBranch: "main"
#   gitRepoOwner:     "acme"
#   gitRepoName:      "my-app"
#   previousScriptsOutput: undefined   ← nothing has run yet
#
# Script 1 writes:
#   { versionName: "1.4.2", commitSha: "abc123" }

# Script 2 receives:
#   gitCurrentBranch: "main"           ← original input, unchanged
#   gitRepoOwner:     "acme"           ← original input, unchanged
#   gitRepoName:      "my-app"         ← original input, unchanged
#   previousScriptsOutput:
#     versionName: "1.4.2"             ← from script 1
#     commitSha:   "abc123"            ← from script 1
#
# Script 2 writes:
#   { versionName: "1.4.2", commitSha: "abc123" }   ← confirmed/enriched output
```

After all commands have run, decaf uses the final cumulative output to determine the result of the step:

- **`get_latest_release_current_branch` and `get_next_release_version`** steps: the cumulative merge of all script outputs is checked for validity after all scripts run. If the merged result is valid, it is used as the step result. If no script produced valid output, the step returns no result.
- **`deploy`** step: all commands run regardless. No output is required.

This composability is useful for splitting logic across focused scripts. For example, one script can fetch a release from GitHub and write its version to the output, and a second script can read that version from its input, enrich it with additional metadata, and write the final result.

Ok, now here are examples of how to run multiple commands per step:

**GitHub Actions example:**
```yaml
- uses: levibostian/decaf@<version>
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    # Deploy: all commands run, each receives the previous script's output as input
    deploy: |
      npm run build
      npm run test
      python scripts/deploy.py
    # Get latest release: all commands run, each builds on the previous script's output
    get_latest_release_current_branch: |
      python scripts/fetch-github-release.py
      python scripts/enrich-release-data.py
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

Be aware that when you chain commands inside a single string with `&&`, decaf treats the entire string as one script. Only the output written by the last command in the chain will be available. Using separate commands (as shown above) is preferred because it gives each script access to the output of every previous script.

# Push git commits to your deployment branch

You're on the final step to automating your deployments!

The final step is to create some git commits and push them to your deployment branch. When decaf runs, it will check if it is running in a pull request or not. If it is not in a pull request, decaf will consider that a real deployment. So whatever branch you setup your CI server to run decaf on will be your deployment branch.

🎊 Congrats! You're all setup for automated deployments! 

# GitHub Authentication

decaf relies on GitHub Authentication to perform various operations such as reading repository pull request settings, finding open pull requests, and posting comments to pull requests. Generate a GitHub token and provide it with the `github_token` input to authenticate decaf with GitHub.

On GitHub Actions, you can use the `permissions` key in your workflow file to customize the permissions of the automatically provided `GITHUB_TOKEN`. Otherwise, you can use either a classic GitHub personal access token (PAT) or a fine-grained PAT. **Fine-grained tokens are recommended** and work perfectly with this project.

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
