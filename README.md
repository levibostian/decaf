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
> not been fully developed yet. You're feedback is always welcome throughout development! 

# How does this tool work? 

You might be wondering, *What do you mean you can automate a deployment?* An automated deployment means that all you need to do to deploy your code is merge a pull request and that's it. The entire deployment process will be done for you in the background while you move onto other tasks of your project. That means that this tool will...

* Bump the semantic version of your software to the next major, minor, or patch version. 
* Update metadata files with the new version. 
* Push the code to deployment server. 
* Create git tag and GitHub Release with the new version. 

You might think this is magic, but really, your git history is what drives this deployment process. When you run the tool, it will analyze your git commit history on the branch that you're running the tool on. When your git commit messages follow a specific format (such as [conventional commits](https://www.conventionalcommits.org)), the tool is able to determine the next sematic version and run your deployment scripts. 

# Getting started

Just follow these 3 steps. 

1. [Install the tool](#install-the-tool-with-github-actions)
2. [Write the deployment scripts](#write-your-deployment-scripts)
3. [Push git commits to your deployment branch](#push-git-commits-with-the-correct-pr-message)

## Install the tool with Github Actions

This tool is designed to run on GitHub Actions for the project that you want to deploy. 

Here is an example workflow file to install and run the tool in your project. Read the comments to learn about the requirements for setting up the project. 

```yml
# In your project, what branch do you merge code into when it's ready to ship? 
# Replace 'main' below with the branch your project uses. 
# When you merge a pull request or push new commits to this branch, it will run the tool to run the deployment process. 
on: 
  push: [main] 

jobs: 
  deploy:
    runs-on: ubuntu-latest
    # To run a deployment with this tool, some permissions are required. 
    permissions:    
      contents: write # This tool creates GitHub releases and tags for each deployment. This permission allows that to happen. 
    steps:
      - uses: actions/checkout@v4
      
      # This block installs the tool and configures it for your project. 
      - uses: levibostian/new-deployment-tool@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          # deploy_commands is where you provide a list of scripts that performs the deployment of your project. 
          # In this example, the deployment script is written in python but you can use whatever language or tools you want! 
          # Add 1+ commands below that will all be executed when a deployment occurs. 
          # If any of the commands exit with a non-zero exit code, the deployment process will terminate and the GitHub Action will fail. 
          deploy_commands: |
            pip install -r requirements.txt # Installs the packages that the deploy.py script needs 
            python scripts/deploy.py # Runs the deploy.py script that performs the deployment 
```

> Reminder: Remember, the `deploy_commands` will only run if [git commits you push will trigger a deployment](#how-does-this-tool-work).

## Write your deployment scripts

Next, it's time for you to write the code that is responsible for deploying your project. This could be updating the version number in some source code and pushing the code to a server (npm, Maven Central, CocoaPods, etc). 

We designed this tool to be flexible and allow you to write the scripts in whatever language is most comfortable to you. No matter what language/tools you decide to use, follow these instructions to write your scripts. 

#### 1. Get input data from the tool

Your deployment scripts are provided with input data that you may find useful during the deployment process. This data is provided to you via a JSON file. 

Here is an example piece of code to explain how to get this input data: 

> Tip: The code below is python but you can use whatever language/tool you want for your deployment script. Read the comments to understand the steps your code needs to perform. 

```py
import json
import os

# The environment variable 'DATA_FILE_PATH' contains the file path to the JSON input file. 
# Your script needs to open this file and read the file's contents into a string. 
input_data_json_string = open(os.getenv('DATA_FILE_PATH'), 'r').read()

# Take the file string and parse the JSON into a data structure (like a dictionary or map) to be easier to use. 
input_data = json.loads(input_data_json_string)

# Your script can now get whatever data is useful, such as the new version name. 
next_version_name = input_data.get("nextVersionName")

# IMPORTANT: Test mode 
# When running this tool in a pull request, the tool will run in "test mode".
# When in test mode, run your deployment script as usual, but do not push code to your production server to actually deploy code.
# Feel free to push to a test server or just print out what you would do.
is_in_test_mode = input_data.get("testMode")

# For a full list of all JSON keys available to you, see: https://github.com/levibostian/new-deployment-tool/blob/HEAD/lib/types/environment.ts
```

#### 2. Perform the deployment

Every project is unique in how a deployment is done. You might push to a server (Docker Hub, npm, Maven Central) or you might just need to create a git tag (go, Swift Package Manager). This tool will create a new git tag after all of your deployment scripts run successfully but besides that, all of the other deployment steps are done by your scripts. 

When you write your script, it's *highly* recommended to follow these best practices to make your deployments stable and calm. 

**Best Practice #1: Check if the code has already shipped before.** 

Most servers (npm, Maven Central, CocoaPods) do not allow you to push code with the same version multiple times. We believe the best deployment script is one that's only job is make sure that a given version of code is available on a server. Therefore, instead of having your script fail when trying to push a version that has already been pushed, have your script succeed because the version already exists. If the version already exists on the deployment server, go ahead and exit your script early. 

For convenience, you might find [this CLI tool handy](https://github.com/levibostian/is-it-deployed) to check popular deployment servers for a given version. 

**Best Practice #2: Edit metadata files and push to server.** 

Once your script has decided that you should push code to a server, now is the time to do it. Edit metadata files (example: update the version in your `package.json`, `.podspec`, `.gradle` files) and push to servers. It's highly recommended to make your script fail if there are any issues with pushing the code to the server (authentication, 500 response, network issues, etc). 

**Best Practice #3: Verify the push to server was successful.**

When your deployment script pushes to the deployment server, you should perform another check to be confident that the deployment was successful. A great strategy for this is to check with the server you pushed your code to and verify the new version now exists. It's recommended to have your deployment script fail if the new version does not exist on the deployment server. 

Again, you might find [this CLI tool handy](https://github.com/levibostian/is-it-deployed) for performing this check.

#### 3. (Optional) commit your metadata file modifications to git

Some projects (go, Swift Package Manager) use git tags as the method of deploying code. It's expected that the latest commit of that git tag has the correct version in the metadata files (`Package.swift`, for example). This tool makes it easy for you to make these commits and git tags for you. 

If you edited files during the deployment process that you want to have included in the git tag, see this example code snippet to explain how to do this: 

> Reminder: The code below is python but you can use whatever language/tool you want for your deployment script. Read the comments to understand the steps your code needs to perform. 

```py
import json
import os

# Just like with the input data, you send data back to the tool by using a JSON file. 

# First, create the JSON string. Each language is different. In Python, you create a dictionary: 
output_data = {"filesToCommit": ["foo.txt"]} # notice the value is an array of relative or absolute paths. 
# To understand the format of the JSON string to create, see: https://github.com/levibostian/new-deployment-tool/blob/main/lib/steps/types/deploy.ts#L13-L15
 
# Next, generate a JSON string and then write that string to a file.
# The file path is given to you by the environment variable 'DATA_FILE_PATH'. 
output_data_file_path = os.getenv("DATA_FILE_PATH")
# In python, you can use json.dump() to write a dictionary to a file as a JSON string. 
json.dump(output_data, open(output_data_file_path, "w"))
```

> Tip: The git commit is created on the branch that the deployment process is running on. Your team may not want noisy metadata file commits to be in your `main` branch. A recommended way to get around this is to run your deployment from a different branch (commonly named `latest`). When code is pushed to `main` branch, you merge those commits into `latest` and then run the deployment on the `latest` branch. To learn how to set this up, see these workflow files [1](https://github.com/levibostian/action-hide-sensitive-inputs/blob/main/.github/workflows/trigger-deploy.yml), [2](https://github.com/levibostian/action-hide-sensitive-inputs/blob/main/.github/workflows/deploy-action.yml). 

#### 4. Test your deployment script

Yay! Your script is complete! It's probably a good idea at this point to test that your script works. There are multiple ways that you can do it. Here are some ideas. 

* (Fastest method) Go ahead and run a deployment by pushing your script into your deployment branch and run the tool. This is risky as your script might have issues, but this could be the easiest way for you to test your script by simply performing a deployment. 
* (Recommended method) Write automated tests against your script. You can easily write automated tests against your script by providing a input JSON file (send file path to script via environment variable `DATA_FILE_PATH`) and asserting the script's exit code and output JSON file contents. Example test cases: *1. Given a new version that was has been pushed before, expect script to exit successfully and not push to deployment server again.*, *2. Given server 500 response, expect script to fail.*, *3. Given version does not exist on deployment server, expect script modified `Package.swift` file and wrote output JSON file with file included.*

## Push git commits with the correct PR message

Some git commits that you push to your deployment branch should be released (features, bug fixes), and some git commits should not be released (docs changes, adding new tests, refactors). You tell the tool if a deployment should be done by formatting your git commit message in a specific format called [conventional commits](https://www.conventionalcommits.org). 

If your team is not used to using a special format for git commit messages, you may find [this tool useful](https://github.com/levibostian/action-conventional-pr-linter) to lint pull requests before you click *Squash and merge* and perform a deployment. 

🎊 Congrats! You're all setup for automated deployments! 

*Tip:* We suggest checking out [how to create pre-production releases](#create-prerelease-versions) to see if this is something you're interested in. 

> Note: In the future, we plan on allowing you to customize how git commits are analyzed so you can use a git commit message format your team decides. Until then, you must use conventional commits format. 

# Outputs 

This tool provides you with outputs to help you understand what happened during the deployment process.

* `new_release_version` - If a new release was created, this is the version of that release.
* `test_mode_on` - If test mode was on when the tool ran. Value is string values "true" or "false".

# Configuration 

Customize this tool to work as you wish. 

### Create prerelease versions

While developing new features of a project, it can be convenient to create prerelease versions such as an alpha or beta. You can configure the tool to make these types of releases, too. To do so, follow these steps: 

1. Configure what branches should create pre-production releases. 

```yml
# This block installs the tool and configures it for your project. 
- uses: levibostian/new-deployment-tool@main
  with:
    # Add this new config option to your github workflow file.
    # The format of this block is a JSON string. 
    # For this block, provide a list of branches that releases 
    # should occur on when you push code to those branches. 
    # If you want a branch to create pre-production releases, set 
    # 'prerelease' to true. 
    analyze_commits_config: |
      {
        "branches": [
          { "branch_name": "main", "prerelease": false },
          { "branch_name": "beta", "prerelease": true },
          { "branch_name": "alpha", "prerelease": true }
        ]
      } 
```

The example above will create pre-production releases when code is pushed to both the `alpha` and `beta` branches. 

2. Push code to the branches that you configured. 

Create conventional commits as you are already used to doing and push those commits to the branches you configured as `prerelease` branches. A deployment will occur with a pre-production semantic version. 

> Note: Make sure that your `prerelease` branches are kept up-to-date with your production branch. If you don't the pre-production version that is created will be incorrect and could confuse your app's users. 

### Test mode for multiple different merge types 

Test mode allows you to test your deployment in a pull request before you merge. It will tell you what will happen if you do decide to merge. To run in test mode, you must tell the tool what type of merge you plan on doing (merge, squash, rebase). But what if your team uses multiple different merge types? You can run the tool multiple times in test mode to test each merge type.

To do this, it's as easy at running the tool multiple times in the same workflow file. Here is an example of how to do this: 

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
repository that is not a production app of yours to verify that the tool works
in a real-world scenario. Beyond these 2 methods of testing, you can also run
the tool locally on your machine. It's not the most convenient way to test yet,
but it can help in certain situations.

- First, tell the tool what scripts to run for deployment:
  `export INPUT_DEPLOY_COMMANDS="python3 ../test-new-deployment-tool/test.py"`
- Second, tell the tool what github repo you want to run against:
  `export GITHUB_REF="refs/heads/main"; export GITHUB_REPOSITORY="levibostian/Wendy-iOS"`
- Then, run the tool. Use the `deno` command from `action.yml` and modify it a
  little bit to run it locally.

Replace the github URL with `deploy.ts` to tell Deno to run the local file not
the remote file. Add 2 extra environment variables...
`GITHUB_EVENT_NAME=pull_request INPUT_GITHUB_TOKEN="XXX" deno...`

# Tests

To run the automated test suite, view the `deno test` command in
`./.github/workflows/tests.yml`. Run that on your local machine to run all
tests.
