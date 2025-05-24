# GitHub Release get-latest-release step 

A step for new-deployment-tool to get the latest release of your project, if your project uses GitHub releases during your deployment process.

# Getting started

1. Make sure that your github actions environment has Deno installed. 

2. Run the step as part of your new-deployment-tool configuration.

```yml
# In your github actions workflow that runs new-deployment-tool, run the step: 
- ...
  with:
    get-latest-release: "deno run --allow-all steps/get-latest-release/get-latest-release.ts"
```

# Development 

This directory is meant to be an entirely self-contained step. It can be run independently of the rest of the new-deployment-tool codebase. Although, at this time, it does reference code from the new-deployment-tool codebase. 

**Running tests** - The included test script does not use mocking to get the github releases of a project. Run the test with script: 

`INPUT_GITHUB_TOKEN="your-github-token-here" deno test --allow-all steps/get-latest-release/get-latest-release.integration.test.ts`