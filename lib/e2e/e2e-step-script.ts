#! /usr/bin/env -S deno run --allow-all 

/**
 * This is the script that runs for deployment steps for the e2e tests.
 *
 * The e2e test class can call functions on this script that change this scripts behavior. Because this script will be executed in it's own environment, we use the file system to communicate together.
 */

/**
 * The script's code that runs when decaf runs this script.
 */

// First, check if we should throw an error in our script.
// Allowing us to test error handling when a deployment step fails.
const shouldThrowData = Deno.readTextFileSync("/tmp/e2e-should-throw.json")
const { shouldThrow, errorMessage } = JSON.parse(shouldThrowData)
if (shouldThrow) {
  throw new Error(errorMessage)
}

// Save the input for the test to reference later.
const inputDataPath = Deno.env.get("DECAF_COMM_FILE_PATH")!
const inputData = Deno.readTextFileSync(inputDataPath)
Deno.writeFileSync(
  "/tmp/e2e-input.json",
  new TextEncoder().encode(inputData),
)

// Determine which step is being called based on the input structure
const input = JSON.parse(inputData)
let outputFilePath: string

if (input.nextVersionName !== undefined) {
  // This is a deploy step (has nextVersionName)
  outputFilePath = "/tmp/e2e-get-next-version-output.json" // Deploy uses same output as get-next-version
} else if (input.lastRelease !== undefined || input.gitCommitsSinceLastRelease !== undefined) {
  // This is a get-next-release-version step (has lastRelease or gitCommitsSinceLastRelease)
  outputFilePath = "/tmp/e2e-get-next-version-output.json"
} else {
  // This is a get-latest-release step (only has base fields)
  outputFilePath = "/tmp/e2e-get-latest-release-output.json"
}

// Return the output that the e2e test class said to use
Deno.writeFileSync(
  inputDataPath,
  new TextEncoder().encode(Deno.readTextFileSync(outputFilePath)),
)
