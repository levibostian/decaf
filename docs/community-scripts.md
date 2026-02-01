# Community scripts 

Here is a collection of community scripts that are designed to be reusable across projects. You can use these scripts as-is or modify them to fit your specific needs! 

**Important:** Remember, you can use *any* of these scripts no matter the programming language used.

You can use these scripts in combination with your own scripts. Decaf allows you to pass in multiple commands for each deployment step, so feel free to mix and match community scripts with your custom scripts as needed.

```bash
# Here is an example of a deployment using 3 different scripts. 
# decaf will run each script in the order they are provided.
decaf \
  # Deploy package to npmjs.com using a community script
  --deploy "npx @levibostian/decaf-script-npm" \
  # Run your own custom deployment script 
  --deploy "python ./deployment-scripts/deploy.py" \ 
  # Update the single-source-of-truth latest version using a community script
  --deploy "npx @levibostian/decaf-script-github-releases"
```

## Script 1: Get latest release for current branch

- [GitHub Releases - use GitHub Releases as single-source-of-truth for deployment versions](https://github.com/levibostian/decaf-script-github-releases)

## Script 2: Get next release version

- [Conventional Commits - determine next semantic version based on commit messages](https://github.com/levibostian/decaf-script-conventional-commits)

## Script 3: Deploy 

- [npm - Publish JavaScript/TypeScript packages to npm](https://github.com/levibostian/decaf-script-npm)
- [Jsr.io - Publish JavaScript/TypeScript packages to jsr.io](https://github.com/levibostian/decaf-script-jsr)
- [GitHub Releases - use GitHub Releases as single-source-of-truth for deployment versions](https://github.com/levibostian/decaf-script-github-releases)