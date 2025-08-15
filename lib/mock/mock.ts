import { GetParametersFromProp, GetReturnFromProp, Stub, stub } from "@std/testing/mock"

/**
 * Example:
 * ```
 * interface GitHubActions {
 *  isRunningInPullRequest(): Promise<boolean>
 * }
 *
 * const githubActions: GitHubActions = mock()
 * when(githubActions, "isRunningInPullRequest", async () => true)
 *
 * // optionally, get information about the mock:
 * const isRunningInPullRequestMock = when(...)
 * assertEquals(isRunningInPullRequestMock.calls.length, 1)
 * ```
 */

export function when<T, Prop extends keyof T>(
  mockObject: T,
  functionName: Prop,
  thenCall: (this: T, ...args: GetParametersFromProp<T, Prop>) => GetReturnFromProp<T, Prop>,
): Stub<T, GetParametersFromProp<T, Prop>, GetReturnFromProp<T, Prop>> {
  return stub(mockObject, functionName, thenCall)
}

/**
 * Create a new mock.
 *
 * This was created with the following goals in mind:
 * 1. return an empty object to avoid false positives in tests. When using stub() on a production object instance to change behavior of just 1 function, you might forget to stub another function that gets called, leading to false positives.
 * 2. for methods that return Promise<void> or void, automatically stub those functions so you don't have to manually do it with `when()`.
 *
 * If you want to access call tracking to a method that we automatically stub, you can cast it to `Stub` like this:
 * ```
 * const myMockedService: MyService = mock()
 * const myMethodStub = myMockedService.myMethod as Stub
 * assertSpyCall(...)
 * ```
 * But it's actually recommended to use `when()` in your test function and then access the calls on that.
 */
export function mock<T>(): T {
  const mockObject = {} as T

  // Create a proxy that provides intelligent defaults for function calls
  return new Proxy(mockObject as object, {
    // function called every time a property is accessed, not just right now during construction
    get(target, prop) {
      const mockTarget = target as T

      // If the property is not a string (e.g., Symbol), return it directly
      if (typeof prop !== "string") {
        return mockTarget[prop as keyof T]
      }

      const key = prop as keyof T

      // If the property exists (it was stubbed in test), return it
      if (key in (mockTarget as object)) {
        return mockTarget[key]
      }

      // Use the when() function to create a proper stub with call tracking
      // This gives you all the benefits of stubs (call count, args, etc.)
      const smartDefaultImpl = (..._args: unknown[]) => {
        // Return a resolved Promise for both sync and async void methods
        // - For sync void: the caller will just ignore the return value anyway
        // - For async void: the caller expects a Promise, so this works perfectly
        // This approach ensures compatibility with both patterns
        return Promise.resolve()
      }

      const smartDefaultStub = when(
        mockTarget,
        key,
        smartDefaultImpl as unknown as (this: T, ...args: GetParametersFromProp<T, typeof key>) => GetReturnFromProp<T, typeof key>,
      )

      return smartDefaultStub
    },
  }) as T
}
