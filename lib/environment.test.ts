import { assertEquals } from "@std/assert"
import { EnvironmentImpl } from "./environment.ts"

function setupEnvironment(): string | undefined {
  return Deno.env.get("INPUT_BRANCH_FILTERS")
}

function restoreEnvironment(originalValue: string | undefined): void {
  if (originalValue === undefined) {
    Deno.env.delete("INPUT_BRANCH_FILTERS")
  } else {
    Deno.env.set("INPUT_BRANCH_FILTERS", originalValue)
  }
}

Deno.test("getBranchFilters - should return empty array when branch_filters input is not set", () => {
  const original = setupEnvironment()

  try {
    // Ensure the environment variable is not set
    Deno.env.delete("INPUT_BRANCH_FILTERS")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, [])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should return empty array when branch_filters input is empty string", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, [])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should return empty array when branch_filters input contains only whitespace", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "   ")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, [])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should return single filter when one branch is specified", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "main")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should return multiple filters when comma-separated branches are specified", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "main,develop,feature")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main", "develop", "feature"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should trim whitespace from each filter", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", " main , develop , feature ")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main", "develop", "feature"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should filter out empty strings after splitting", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "main,,develop,  ,feature")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main", "develop", "feature"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle single comma-separated value with extra commas", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", ",main,")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle complex branch names with special characters", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/new-deployment,bugfix/issue-123,release/v1.0.0")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/new-deployment", "bugfix/issue-123", "release/v1.0.0"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should return empty array when all filters are empty after trimming", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", " , , ")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, [])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with asterisk", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/*,release/*,hotfix/*")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/*", "release/*", "hotfix/*"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with question mark", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "v?.?.?,release-v?")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["v?.?.?", "release-v?"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle mixed glob patterns and literal branch names", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "main,develop,feature/*,release/v*,bugfix-*")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main", "develop", "feature/*", "release/v*", "bugfix-*"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with square brackets", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "release/[0-9]*,feature/[a-z]*,v[0-9].[0-9].[0-9]")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["release/[0-9]*", "feature/[a-z]*", "v[0-9].[0-9].[0-9]"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle complex glob patterns with multiple wildcards", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "*/feature/*,*-hotfix-*,release-*-*")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["*/feature/*", "*-hotfix-*", "release-*-*"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with braces containing commas", () => {
  const original = setupEnvironment()

  try {
    // Now that we have brace-aware splitting, patterns with commas inside braces work correctly
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new,old}/*,release/{alpha,beta,rc}")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    // The function now properly handles brace patterns with commas
    assertEquals(result, ["feature/{new,old}/*", "release/{alpha,beta,rc}"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle complex brace patterns with mixed content", () => {
  const original = setupEnvironment()

  try {
    // Test complex patterns mixing literals and brace expansions
    Deno.env.set("INPUT_BRANCH_FILTERS", "main,feature/{ui,api,db}/*,release-{v1,v2}.*,hotfix")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["main", "feature/{ui,api,db}/*", "release-{v1,v2}.*", "hotfix"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle nested braces", () => {
  const original = setupEnvironment()

  try {
    // Test nested brace patterns (though less common in practice)
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new/{ui,api},old/*}")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/{new/{ui,api},old/*}"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle braces with whitespace", () => {
  const original = setupEnvironment()

  try {
    // Test brace patterns with spaces around commas inside braces
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new, old, legacy}/* , release/{alpha, beta}")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/{new, old, legacy}/*", "release/{alpha, beta}"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with braces without commas", () => {
  const original = setupEnvironment()

  try {
    // Brace patterns work fine when they don't contain commas
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature/{new}/*,release/{alpha}")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/{new}/*", "release/{alpha}"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle glob patterns with whitespace around them", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", " feature/* , release/v* , hotfix-* ")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature/*", "release/v*", "hotfix-*"])
  } finally {
    restoreEnvironment(original)
  }
})

Deno.test("getBranchFilters - should handle escaped glob characters", () => {
  const original = setupEnvironment()

  try {
    Deno.env.set("INPUT_BRANCH_FILTERS", "feature\\*literal,branch\\?name,release\\[test\\]")

    const environment = new EnvironmentImpl()
    const result = environment.getBranchFilters()

    assertEquals(result, ["feature\\*literal", "branch\\?name", "release\\[test\\]"])
  } finally {
    restoreEnvironment(original)
  }
})
