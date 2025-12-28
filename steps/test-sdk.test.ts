// a decaf script test runner essentially. Copied from decaf: https://github.com/levibostian/decaf/blob/a0e324f7209c0f37b9d275b7259fcefd591a17c6/steps/get-next-release.test.ts#L4

import { GetLatestReleaseStepOutput } from "../lib/steps/types/output.ts"
import { AnyStepInput } from "../lib/types/environment.ts"

// would be nice to put into decaf or the sdks in the future.
export async function runScript<TInput extends AnyStepInput, TOutput = GetLatestReleaseStepOutput>(
  runScriptShellCommand: string,
  input: TInput,
): Promise<{ code: number; output: TOutput | null; stdout: string }> {
  // Write script input to a temp file
  const tempFile = await Deno.makeTempFile()
  const inputFileContents = JSON.stringify(input)
  await Deno.writeTextFile(tempFile, inputFileContents)

  const env: Record<string, string> = {
    INPUT_GITHUB_TOKEN: "abcd1234",
    DATA_FILE_PATH: tempFile,
    ...Deno.env.toObject(),
  }

  // This code is the same as exec.ts in decaf.
  // using 'sh -c' allows us to run complex commands that contain &&, |, >, etc.
  // without it, commands like `echo "test" >> output.txt` would not work. you could only do simple commands like `echo "test"`.
  const process = new Deno.Command("sh", {
    args: ["-c", runScriptShellCommand],
    stdout: "piped",
    stderr: "piped",
    env,
  })

  const child = process.spawn()
  const { code, stdout, stderr } = await child.output()
  // Combine stdout and stderr for the test assertions
  const combinedOutput = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr)

  console.log(combinedOutput) // output to console for visibility during tests

  const outputFileContents = await Deno.readTextFile(tempFile)
  let output: TOutput | null = null
  if (outputFileContents != inputFileContents) { // if unchanged, no output written. keep output as null
    output = JSON.parse(outputFileContents)
  }

  return { code, output, stdout: combinedOutput }
}

export const arrayDifferences = <T>(arr1: T[], arr2: T[]): T[] => {
  const differences1 = arr1.filter((item) => !arr2.includes(item))
  const differences2 = arr2.filter((item) => !arr1.includes(item))
  const uniqueDifferences = new Set([...differences1, ...differences2])
  return [...uniqueDifferences]
}

export const getCommandsExecuted = (stdout: string): string[] => {
  return stdout
    .split("\n") // convert string into array
    .filter((line) => line.startsWith(">")) // keep only lines that are commands
    .map((line) => line.slice(2).trim()) // remove the "> " prefix
}
