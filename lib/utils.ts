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
