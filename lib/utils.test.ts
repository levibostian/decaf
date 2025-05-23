import { assertEquals } from "@std/assert"
import { jsonParse } from "./utils.ts"

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
