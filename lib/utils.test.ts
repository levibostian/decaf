import { assertEquals, assertRejects } from "@std/assert"
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
  await assertRejects(
    async () => await renderStringTemplate("{{ if (condition) }}No closing tag", { condition: true }),
    Error,
    "Failed to render the string template",
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
