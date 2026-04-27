# ADR 0001: No Support for Release Branches

**Date:** 2026-04-13  
**Status:** Accepted

---

## Context

A "release branch" pattern refers to the practice of performing a deployment from one Git branch (e.g. `main`) while directing Git tags and other deployment artifacts to land on a separate branch (e.g. `latest`). In this pattern, a developer is checked out to `main`, triggers a deployment to run decaf, have decaf run all scripts on the current branch (`main`) and expects the resulting Git tag to be made on a different branch entirely.

Work began to support this pattern in this tool. [A community script was written](https://github.com/levibostian/decaf-script-release-branch) that allowed steps to communicate with a branch other than the currently checked-out one. That implementation worked, but it surfaced a deeper problem: supporting this pattern cannot be contained to a single script. Any script that interacts with the Git history (such as the script you use to get your latest release from single-source-of-truth), creates commits, or reads branch state would also need to be aware of this "secondary branch" concept. The burden would fall on *every script author* to explicitly handle the two-branch case.

### Why not build it into the tool itself?

The mechanics of reconciling two branches are highly variable and depend entirely on the user's workflow. Options include:

- Merging the deployment branch into the release branch
- Cherry-picking specific commits
- Rebasing
- Simply writing metadata (e.g. a file or tag) to the release branch without touching history

There is no single correct approach, and the tool cannot know which strategy a given user needs. Building in first-class support for release branches would require either picking one strategy (too opinionated) or exposing a complex configuration surface (too much complexity for unclear benefit).

---

## Decision

**This tool does not support working with 2 branches simultaneously.**

The tool is designed around a single invariant: **the user is checked out to the branch where the deployment is happening.** This means script authors may assume the user is already on the correct branch. There is no need to handle the case where the deployment branch and the tag destination are different.

---

## Consequences

### For users who want a release branch pattern

Users who want Git tags on a branch other than the branch that triggered the deployment (e.g. `main`) should check out that branch before running decaf. For example:

```bash
git checkout latest && git merge main
decaf ...
```

It may also be possible to check out the target branch within the "get latest release" step though this has not been tested and is left to the user's discretion.

### For script authors

Scripts only need to handle one case: the user is on the branch where the deployment is happening. There is no need to accept or forward a `releaseBranch` parameter or otherwise account for cross-branch operations.

### Sustainability

Dropping release branch support removes an obligation that would otherwise spread across every script in the ecosystem. This keeps the tool's contract simple and its scripts easy to write and reason about.
