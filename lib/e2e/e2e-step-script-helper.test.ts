/**
 * helper functions for the e2e-step-script.test.ts file. Needs to be in it's own separate file because that file is designed to execute only during decaf runtime. If you import that module too early, it will not work and probably throw errors. This module contains functions to setup the script.
 */

import { GetLatestReleaseStepOutput, GetNextReleaseVersionStepOutput } from "../steps/types/output.ts"
import { GetLatestReleaseStepInput, GetNextReleaseVersionStepInput } from "../types/environment.ts"

/**
 * Functions that the e2e test class can call to change this script's behavior.
 */

export const getBashCommandToRunThisScript = (): string => {
  return `${new URL(".", import.meta.url).pathname}e2e-step-script.ts`
}

export const setGetLatestReleaseStepOutput = (output: GetLatestReleaseStepOutput | null) => {
  Deno.writeFileSync("/tmp/e2e-get-latest-release-output.json", new TextEncoder().encode(JSON.stringify(output || {})))
}

export const setNextReleaseVersionStepOutput = (output: GetNextReleaseVersionStepOutput | null) => {
  Deno.writeFileSync("/tmp/e2e-get-next-version-output.json", new TextEncoder().encode(JSON.stringify(output || {})))
}

export const getGetLatestReleaseInput = (): GetLatestReleaseStepInput => {
  const data = Deno.readTextFileSync("/tmp/e2e-input.json")
  return JSON.parse(data)
}

export const getNextReleaseVersionInput = (): GetNextReleaseVersionStepInput => {
  const data = Deno.readTextFileSync("/tmp/e2e-input.json")
  return JSON.parse(data)
}

// Tells a step script to throw an error when it runs.
// Allowing us to test error handling when a deployment step fails.
export const setShouldThrowError = (shouldThrow: boolean, errorMessage: string = "Deployment failed!") => {
  Deno.writeFileSync("/tmp/e2e-should-throw.json", new TextEncoder().encode(JSON.stringify({ shouldThrow, errorMessage })))
}
