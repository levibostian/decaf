import { assertEquals } from "@std/assert"
import { EnvironmentImpl } from "./environment.ts"

function setupBranchFiltersEnvironment(): string | undefined {
  return Deno.env.get("INPUT_BRANCH_FILTERS")
}

function restoreBranchFiltersEnvironment(originalValue: string | undefined): void {
  if (originalValue === undefined) {
    Deno.env.delete("INPUT_BRANCH_FILTERS")
  } else {
    Deno.env.set("INPUT_BRANCH_FILTERS", originalValue)
  }
}

function setupCommitLimitEnvironment(): string | undefined {
  return Deno.env.get("INPUT_COMMIT_LIMIT")
}

function restoreCommitLimitEnvironment(originalValue: string | undefined): void {
  if (originalValue === undefined) {
    Deno.env.delete("INPUT_COMMIT_LIMIT")
  } else {
    Deno.env.set("INPUT_COMMIT_LIMIT", originalValue)
  }
}

Deno.test("getBranchFilters - should return empty array when branch_filters input is not set", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    // Ensure the environment variable is not set
    Deno.env.delete("INPUT_BRANCH_FILTERS")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, [])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should return empty array when branch_filters input is empty string", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, [])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should return empty array when branch_filters input contains only whitespace", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "   ")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, [])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should return single filter when one branch is specified", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "main")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should return multiple filters when comma-separated branches are specified", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "main,develop,feature")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main", "develop", "feature"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should trim whitespace from each filter", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", " main , develop , feature ")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main", "develop", "feature"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should filter out empty strings after splitting", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "main,,develop,  ,feature")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main", "develop", "feature"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle single comma-separated value with extra commas", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", ",main,")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle complex branch names with special characters", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/new-deployment,bugfix/issue-123,release/v1.0.0")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/new-deployment", "bugfix/issue-123", "release/v1.0.0"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should return empty array when all filters are empty after trimming", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", " , , ")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, [])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with asterisk", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/*,release/*,hotfix/*")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/*", "release/*", "hotfix/*"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with question mark", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "v?.?.?,release-v?")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["v?.?.?", "release-v?"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle mixed glob patterns and literal branch names", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "main,develop,feature/*,release/v*,bugfix-*")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main", "develop", "feature/*", "release/v*", "bugfix-*"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with square brackets", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "release/[0-9]*,feature/[a-z]*,v[0-9].[0-9].[0-9]")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["release/[0-9]*", "feature/[a-z]*", "v[0-9].[0-9].[0-9]"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle complex glob patterns with multiple wildcards", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "*/feature/*,*-hotfix-*,release-*-*")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["*/feature/*", "*-hotfix-*", "release-*-*"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with braces containing commas", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    // Now that we have brace-aware splitting, patterns with commas inside braces work correctly
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new,old}/*,release/{alpha,beta,rc}")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    // The function now properly handles brace patterns with commas
    assertEquals(result, ["feature/{new,old}/*", "release/{alpha,beta,rc}"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle complex brace patterns with mixed content", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    // Test complex patterns mixing literals and brace expansions
    Deno.env.set("INPUT_BRANCH_FILTERS", "main,feature/{ui,api,db}/*,release-{v1,v2}.*,hotfix")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main", "feature/{ui,api,db}/*", "release-{v1,v2}.*", "hotfix"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle nested braces", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    // Test nested brace patterns (though less common in practice)
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new/{ui,api},old/*}")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/{new/{ui,api},old/*}"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle braces with whitespace", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    // Test brace patterns with spaces around commas inside braces
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new, old, legacy}/* , release/{alpha, beta}")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/{new, old, legacy}/*", "release/{alpha, beta}"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with braces without commas", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    // Brace patterns work fine when they don't contain commas
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new}/*,release/{alpha}")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/{new}/*", "release/{alpha}"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with whitespace around them", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", " feature/* , release/v* , hotfix-* ")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/*", "release/v*", "hotfix-*"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle escaped glob characters", () => {
  const original = setupBranchFiltersEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature\\*literal,branch\\?name,release\\[test\\]")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature\\*literal", "branch\\?name", "release\\[test\\]"])
  } finally {
    restoreBranchFiltersEnvironment(original)
  }
})

Deno.test("getCommitLimit - should return 500 when commit_limit input is not set", () => {
  const original = setupCommitLimitEnvironment()

  try {
    // Ensure the environment variable is not set
    Deno.env.delete("INPUT_COMMIT_LIMIT")

    const environment = new EnvironmentImpl()
    const result = environment.getCommitLimit()

    assertEquals(result, 500)
  } finally {
    restoreCommitLimitEnvironment(original)
  }
})

Deno.test("getCommitLimit - should return 500 when commit_limit input is empty string", () => {
  const original = setupCommitLimitEnvironment()

  try {
    Deno.env.set("INPUT_COMMIT_LIMIT", "")

    const environment = new EnvironmentImpl()
    const result = environment.getCommitLimit()

    assertEquals(result, 500)
  } finally {
    restoreCommitLimitEnvironment(original)
  }
})

Deno.test("getCommitLimit - should return valid number when commit_limit is set", () => {
  const original = setupCommitLimitEnvironment()

  try {
    Deno.env.set("INPUT_COMMIT_LIMIT", "100")

    const environment = new EnvironmentImpl()
    const result = environment.getCommitLimit()

    assertEquals(result, 100)
  } finally {
    restoreCommitLimitEnvironment(original)
  }
})

Deno.test("getCommitLimit - should return 500 when commit_limit is invalid", () => {
  const original = setupCommitLimitEnvironment()

  try {
    Deno.env.set("INPUT_COMMIT_LIMIT", "not-a-number")

    const environment = new EnvironmentImpl()
    const result = environment.getCommitLimit()

    assertEquals(result, 500)
  } finally {
    restoreCommitLimitEnvironment(original)
  }
})

Deno.test("getCommitLimit - should return 500 when commit_limit is zero or negative", () => {
  const original = setupCommitLimitEnvironment()

  try {
    Deno.env.set("INPUT_COMMIT_LIMIT", "0")

    const environment = new EnvironmentImpl()
    const result = environment.getCommitLimit()

    assertEquals(result, 500)

    // Test negative number
    Deno.env.set("INPUT_COMMIT_LIMIT", "-10")
    const result2 = environment.getCommitLimit()
    assertEquals(result2, 500)
  } finally {
    restoreCommitLimitEnvironment(original)
  }
})

function setupCommandForStepEnvironment(stepName: string): string | undefined {
  return Deno.env.get(`INPUT_${stepName.toUpperCase()}`)
}

function restoreCommandForStepEnvironment(stepName: string, originalValue: string | undefined): void {
  if (originalValue === undefined) {
    Deno.env.delete(`INPUT_${stepName.toUpperCase()}`)
  } else {
    Deno.env.set(`INPUT_${stepName.toUpperCase()}`, originalValue)
  }
}

Deno.test("getCommandsForStep - should return undefined when step input is not set", () => {
  const stepName = "deploy"
  const original = setupCommandForStepEnvironment(stepName)

  try {
    Deno.env.delete(`INPUT_${stepName.toUpperCase()}`)

    const environment = new EnvironmentImpl()
    const result = environment.getCommandsForStep({ stepName })

    assertEquals(result, undefined)
  } finally {
    restoreCommandForStepEnvironment(stepName, original)
  }
})

Deno.test("getCommandsForStep - should return undefined when step input is empty string", () => {
  const stepName = "deploy"
  const original = setupCommandForStepEnvironment(stepName)

  try {
    Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "")

    const environment = new EnvironmentImpl()
    const result = environment.getCommandsForStep({ stepName })

    assertEquals(result, undefined)
  } finally {
    restoreCommandForStepEnvironment(stepName, original)
  }
})

Deno.test("getCommandsForStep - should return single command array when single command is provided", () => {
  const stepName = "deploy"
  const original = setupCommandForStepEnvironment(stepName)

  try {
    Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "npm run deploy")

    const environment = new EnvironmentImpl()
    const result = environment.getCommandsForStep({ stepName })

    assertEquals(result, ["npm run deploy"])
  } finally {
    restoreCommandForStepEnvironment(stepName, original)
  }
})

Deno.test("getCommandsForStep - should return multiple commands when separated by newlines", () => {
  const stepName = "deploy"
  const original = setupCommandForStepEnvironment(stepName)

  try {
    Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "npm run build\nnpm run test\nnpm run deploy")

    const environment = new EnvironmentImpl()
    const result = environment.getCommandsForStep({ stepName })

    assertEquals(result, ["npm run build", "npm run test", "npm run deploy"])
  } finally {
    restoreCommandForStepEnvironment(stepName, original)
  }
})

Deno.test("getCommandsForStep - should trim whitespace from each command", () => {
  const stepName = "deploy"
  const original = setupCommandForStepEnvironment(stepName)

  try {
    Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "  npm run build  \n  npm run test  \n  npm run deploy  ")

    const environment = new EnvironmentImpl()
    const result = environment.getCommandsForStep({ stepName })

    assertEquals(result, ["npm run build", "npm run test", "npm run deploy"])
  } finally {
    restoreCommandForStepEnvironment(stepName, original)
  }
})

Deno.test("getCommandsForStep - should filter out empty lines", () => {
  const stepName = "deploy"
  const original = setupCommandForStepEnvironment(stepName)

  try {
    Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "npm run build\n\nnpm run test\n  \nnpm run deploy")

    const environment = new EnvironmentImpl()
    const result = environment.getCommandsForStep({ stepName })

    assertEquals(result, ["npm run build", "npm run test", "npm run deploy"])
  } finally {
    restoreCommandForStepEnvironment(stepName, original)
  }
})

Deno.test("getCommandsForStep - should return undefined when only whitespace and newlines", () => {
  const stepName = "deploy"
  const original = setupCommandForStepEnvironment(stepName)

  try {
    Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "\n  \n\n  ")

    const environment = new EnvironmentImpl()
    const result = environment.getCommandsForStep({ stepName })

    assertEquals(result, undefined)
  } finally {
    restoreCommandForStepEnvironment(stepName, original)
  }
})

Deno.test("getCommandsForStep - should handle commands with special characters", () => {
  const stepName = "deploy"
  const original = setupCommandForStepEnvironment(stepName)

  try {
    Deno.env.set(`INPUT_${stepName.toUpperCase()}`, "echo 'hello world'\ngit commit -m \"test\"\ncurl https://api.example.com")

    const environment = new EnvironmentImpl()
    const result = environment.getCommandsForStep({ stepName })

    assertEquals(result, ["echo 'hello world'", 'git commit -m "test"', "curl https://api.example.com"])
  } finally {
    restoreCommandForStepEnvironment(stepName, original)
  }
})
