#! /usr/bin/env -S deno run --allow-all 

/**
 * This is the script that runs for deployment steps for the e2e tests.
 *
 * The e2e test class can call functions on this script that change this scripts behavior. Because this script will be executed in it's own environment, we use the file system to communicate together.
 */

/**
 * The script's code that runs when decaf runs this script.
 */

// First, save the input for the test to reference later.
Deno.writeFileSync(
  "/tmp/e2e-input.json",
  new TextEncoder().encode(Deno.readTextFileSync(Deno.env.get("DATA_FILE_PATH")!)),
)

// Next, return the output that the e2e test class said to use.
Deno.writeFileSync(
  Deno.env.get("DATA_FILE_PATH")!,
  new TextEncoder().encode(Deno.readTextFileSync("/tmp/e2e-output.json")),
)
