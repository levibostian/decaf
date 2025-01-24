import { stub, spy, GetParametersFromProp, GetReturnFromProp, Stub } from "jsr:@std/testing@1/mock";

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
  thenCall: (this: T, ...args: GetParametersFromProp<T, Prop>) => GetReturnFromProp<T, Prop>): Stub<T, GetParametersFromProp<T, Prop>, GetReturnFromProp<T, Prop>> {
    return stub(mockObject, functionName, thenCall)
}

export function mock<T>(): T {
  const mockObject = {} as T;
  
  // for convenience, stub all functions with an empty implementation. So if a mock function doesn't need any logic, it can be used without needing to call `when` on it.
  for (const key in mockObject) {
    mockObject[key] = stub(mockObject, key) as unknown as T[Extract<keyof T, string>];
  }
  
  return mockObject;
}
