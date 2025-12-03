import * as log from "./log.ts"
import { AnyStepInput } from "./types/environment.ts"

export interface RunResult {
  exitCode: number
  stdout: string
  output: Record<string, unknown> | undefined
}

export interface Exec {
  run: (
    { command, input, displayLogs, currentWorkingDirectory }: {
      command: string
      input: AnyStepInput | undefined
      displayLogs?: boolean
      envVars?: { [key: string]: string }
      throwOnNonZeroExitCode?: boolean
      currentWorkingDirectory?: string
    },
  ) => Promise<RunResult>
}

/*
Executes a command and returns the exit code and the stdout of the command.

The entire command is passed in as 1 string. This is for convenience but also because when used as a github action, the commands will be passed to the tool as a single string.
Then, the command is split into the command and the arguments. This is required by Deno.Command.
You cannot simply split the string by spaces to create the args list. Example, if you're given: `python3 -c "import os; print(os.getenv('INPUT'))"` we expect only 2 args: "-c" and "import ...".
We use a popular package to parse the string into the correct args list. See automated tests to verify that this works as expected.

To make this function testable, we not only have the stdout and stderr be piped to the console, but we return it from this function so tests can verify the output of the command.
*/
const run = async (
  { command, input, displayLogs, envVars, throwOnNonZeroExitCode, currentWorkingDirectory }: {
    command: string
    input: AnyStepInput | undefined
    displayLogs?: boolean
    envVars?: { [key: string]: string }
    throwOnNonZeroExitCode?: boolean
    currentWorkingDirectory?: string
  },
): Promise<RunResult> => {
  if (displayLogs) {
    log.message(` $> ${command}`)
  } else {
    log.debug(` $> ${command}`)
  }

  const environmentVariablesToPassToCommand: { [key: string]: string } = envVars || {}

  // For some features to work, we need to communicate with the command. We need to send data to it and read data that it produces.
  // We use JSON as the data format to communicate with the command since pretty much every language has built-in support for it.
  // Since we are creating subprocesses to run the command, we are limited in how we can communicate with the command.
  // One common way would be to ask the subprocess to stdout a JSON string that we simply read, but this tool tries to promote stdout
  // as a way to communicate with the user, not the tool. So instead, we write the JSON to a file and pass the file path to the command.
  let tempFilePathToCommunicateWithCommand: string | undefined
  let inputDataFileContents: string | undefined
  if (input) {
    tempFilePathToCommunicateWithCommand = await Deno.makeTempFile({
      prefix: "decaf-",
      suffix: ".json",
    })
    inputDataFileContents = JSON.stringify(input)
    await Deno.writeTextFile(
      tempFilePathToCommunicateWithCommand,
      inputDataFileContents,
    )

    environmentVariablesToPassToCommand["DATA_FILE_PATH"] = tempFilePathToCommunicateWithCommand
  }

  // We want to capture the stdout of the command but we also want to stream it to the console. By using streams, this allows us to
  // output the stdout/stderr to the console in real-time instead of waiting for the command to finish before we see the output.
  //
  // using 'sh -c' allows us to run complex commands that contain &&, |, >, etc.
  // without it, commands like `echo "test" >> output.txt` would not work. you could only do simple commands like `echo "test"`.
  const process = new Deno.Command("sh", {
    args: ["-c", command],
    stdout: "piped",
    stderr: "piped",
    env: environmentVariablesToPassToCommand,
    cwd: currentWorkingDirectory,
  })

  const child = process.spawn()

  let capturedStdout = ""
  let capturedStderr = ""

  child.stdout.pipeTo(
    new WritableStream({
      write(chunk) {
        const decodedChunk = new TextDecoder().decode(chunk).trimEnd()

        if (displayLogs) {
          log.message(decodedChunk)
        } else {
          log.debug(decodedChunk)
        }

        capturedStdout += decodedChunk
      },
    }),
  )
  child.stderr.pipeTo(
    new WritableStream({
      write(chunk) {
        const decodedChunk = new TextDecoder().decode(chunk).trimEnd()

        if (displayLogs) {
          log.message(decodedChunk)
        } else {
          log.debug(decodedChunk)
        }

        capturedStderr += decodedChunk
      },
    }),
  )

  const code = (await child.status).code

  let commandOutput: Record<string, unknown> | undefined = undefined

  if (tempFilePathToCommunicateWithCommand) {
    const outputDataFileContents = await Deno.readTextFile(
      tempFilePathToCommunicateWithCommand,
    )
    const commandOutputUntyped = JSON.parse(outputDataFileContents)
    // As long as the command wrote something to the file, we will use it.
    if (
      outputDataFileContents !== inputDataFileContents &&
      typeof commandOutputUntyped === "object" &&
      commandOutputUntyped !== null &&
      !Array.isArray(commandOutputUntyped)
    ) { // there is a chance that the command did not write to the file or they have a bug.
      commandOutput = commandOutputUntyped
    }
  }

  log.debug(
    `exit code, ${code}, command output: ${JSON.stringify(commandOutput)}`,
  )

  let shouldThrowError = true
  if (throwOnNonZeroExitCode !== undefined && throwOnNonZeroExitCode == false) {
    shouldThrowError = false
  }

  if (code !== 0 && shouldThrowError) {
    throw new Error(`Command: ${command}, failed with exit code: ${code}`)
  }

  return {
    exitCode: code,
    stdout: capturedStdout,
    output: commandOutput,
  }
}

export const exec: Exec = {
  run,
}
