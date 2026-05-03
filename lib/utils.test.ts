import { assertEquals } from "@std/assert"
import { jsonParse, renderStringTemplate } from "./utils.ts"

Deno.test("jsonParse - valid JSON string returns object", () => {
  const input = '{"a":1,"b":"test"}'
  const result = jsonParse(input)
  assertEquals(result, { a: 1, b: "test" })
})

Deno.test("jsonParse - invalid JSON string returns undefined", () => {
  const input = '{a:1, b:"test"}'
  const result = jsonParse(input)
  assertEquals(result, undefined)
})

Deno.test("jsonParse - empty string returns undefined", () => {
  const input = ""
  const result = jsonParse(input)
  assertEquals(result, undefined)
})

Deno.test("renderStringTemplate - invalid template syntax throws error", async () => {
  assertEquals(
    await renderStringTemplate(
      `jq '.version = "{{ nextVersionName }}"' deno/version.json > deno/version.json.tmp && mv deno/version.json.tmp deno/version.json`,
      { nextVersionName: "1.0.0" },
    ),
    `jq '.version = "1.0.0"' deno/version.json > deno/version.json.tmp && mv deno/version.json.tmp deno/version.json`,
  )
})

Deno.test("renderStringTemplate - error message includes template content", async () => {
  const badTemplate = "{{ invalid syntax }}"
  try {
    await renderStringTemplate(badTemplate, {})
  } catch (error) {
    assertEquals(error instanceof Error, true)
    assertEquals((error as Error).message.includes(badTemplate), true)
    assertEquals((error as Error).message.includes("syntax error"), true)
  }
})
