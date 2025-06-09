# GitHub Release determine-next-release step

A step for new-deployment-tool to determine what the next version string should be. The step assumes you're using [conventional commits](https://www.conventionalcommits.org/) as the format of your commit messages, and that you are using [semantic versioning](https://semver.org/) for your releases. If either of these is not true, it's suggested to find a different step to use or modify this one to suit your needs.

# Getting started

1. Make sure that your github actions environment has Deno installed. 

2. Run the step as part of your new-deployment-tool configuration.

```yml
# In your github actions workflow that runs new-deployment-tool, run the step: 
- ...
  with:
    get_next_release_version: "deno run --allow-all steps/determine-next-release/determine-next-release.ts"
```

# Configuration

### Create prerelease versions

While developing new features of a project, it can be convenient to create prerelease versions such as an alpha or beta. You can configure the step to make these types of releases, too. To do so, follow these steps: 

1. Configure what branches should create pre-production releases. 

```yml
# Pass in a JSON string as a command line argument to the step: 
- ...
  with:
    get_next_release_version: 'deno run --allow-all steps/determine-next-release/determine-next-release.ts --config "{ "branches": [
        { "branch_name": "main", "prerelease": false },
        { "branch_name": "beta", "prerelease": true },
        { "branch_name": "alpha", "prerelease": true }
    ]}"'
```

The example above will create pre-production releases when code is pushed to both the `alpha` and `beta` branches. 

2. Push code to the branches that you configured. 

Create conventional commits as you are already used to doing and push those commits to the branches you configured as `prerelease` branches. A deployment will occur with a pre-production semantic version.  

# Development 

This directory is meant to be an entirely self-contained step. It can be run independently of the rest of the new-deployment-tool codebase. Although, at this time, it does reference code from the new-deployment-tool codebase. 

**Running tests** - The included test script does not use mocking to get the github releases of a project. Run the test with script: 

`INPUT_GITHUB_TOKEN="your-github-token-here" deno test --allow-all steps/get-latest-release/get-latest-release.integration.test.ts`
