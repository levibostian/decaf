/**
 * Allows you to write function calls in a more readable way.
 *
// Example usage
import { pipe } from './lib/pipe.ts'

const double = (x: number) => x * 2;
const toString = (x: number) => `Result: ${x}`;
const length = (s: string) => s.length;

// Different return types in the pipeline:
// number -> number -> string -> number
const result = pipe(5,
    double,        // number -> number
    toString,      // number -> string
    length         // string -> number
); // result is 8

// You can also use inline functions
const result2 = pipe(5,
    x => x * 2,
    x => `${x}`,
    x => x.length
);

// Type safety is preserved
const badPipe = pipe(5,
    double,
    length  // Type error! Cannot pass number to string
);
 */
export function pipe<T, U>(value: T, fn: (input: T) => U): U
export function pipe<T, U, V>(value: T, fn1: (input: T) => U, fn2: (input: U) => V): V
export function pipe<T, U, V, W>(value: T, fn1: (input: T) => U, fn2: (input: U) => V, fn3: (input: V) => W): W
export function pipe<T, U, V, W, X>(value: T, fn1: (input: T) => U, fn2: (input: U) => V, fn3: (input: V) => W, fn4: (input: W) => X): X
export function pipe(value: unknown, ...fns: Array<(input: unknown) => unknown>): unknown {
  return fns.reduce((result, fn) => fn(result), value)
}

export const jsonParse = (jsonString: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(jsonString)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }

    throw new Error(`Failed to parse JSON: ${error}`)
  }
}

/**
 * Template rendering utilities using VentoJS
 *
 * This module provides a simple abstraction for template rendering. The implementation
 * uses VentoJS, but callers don't need to know that - they just call renderStringTemplate().
 * If we ever want to switch template engines, we only need to modify this file.
 *
 * ## VentoJS Syntax Reference
 *
 * VentoJS is a minimal, fast template engine. Key syntax:
 *
 * ### Variables
 * - Output: `{{ variableName }}`
 * - Nested: `{{ object.property }}`
 * - Array access: `{{ array[0] }}`
 *
 * ### Conditionals
 * - If: `{{ if (condition) }}...{{ /if }}`
 * - If/else: `{{ if (condition) }}...{{ else }}...{{ /if }}`
 * - Ternary: `{{ condition ? "yes" : "no" }}`
 *
 * ### Loops
 * - For loop: `{{ for item of array }}...{{ /for }}`
 * - NOTE: Use `for item of array`, NOT `for (const item of array)`
 * - Access loop item: `{{ item.property }}`
 *
 * ### Filters and Functions
 * - Call methods: `{{ array.join(", ") }}`
 * - String methods: `{{ text.toUpperCase() }}`
 *
 * ### Whitespace
 * - VentoJS preserves whitespace by default
 * - Multiline templates will include newlines as written
 *
 * ## Examples
 *
 * ```typescript
 * // Simple variable
 * renderStringTemplate("Hello {{ name }}", { name: "World" })
 * // => "Hello World"
 *
 * // Conditional
 * renderStringTemplate("{{ if (show) }}Visible{{ /if }}", { show: true })
 * // => "Visible"
 *
 * // Loop
 * renderStringTemplate("{{ for item of items }}{{ item }}{{ /for }}", { items: [1, 2, 3] })
 * // => "123"
 *
 * // Nested properties
 * renderStringTemplate("{{ user.name }}", { user: { name: "Alice" } })
 * // => "Alice"
 * ```
 *
 * @see https://vento.js.org/ - VentoJS documentation
 */

import * as ventolib from "ventojs"

/**
 * Renders a template string with the provided data
 *
 * @param templateString - The template string to render (using VentoJS syntax)
 * @param data - The data to pass to the template
 * @returns The rendered string
 * @throws Error if the template syntax is invalid
 *
 * @example
 * ```typescript
 * const output = await renderStringTemplate(
 *   "Hello {{ name }}!",
 *   { name: "World" }
 * )
 * // => "Hello World!"
 * ```
 */
export async function renderStringTemplate<T extends Record<string, unknown> = Record<string, unknown>>(
  templateString: string,
  data: T,
): Promise<string> {
  const vento = ventolib.default()
  const result = await vento.runString(templateString, data)
  return result.content
}
