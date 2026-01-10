export const arrayDifferences = <T>(arr1: T[], arr2: T[]): T[] => {
  const differences1 = arr1.filter((item) => !arr2.includes(item))
  const differences2 = arr2.filter((item) => !arr1.includes(item))
  const uniqueDifferences = new Set([...differences1, ...differences2])
  return [...uniqueDifferences]
}

export const getCommandsExecuted = (stdout: string[]): string[] => {
  return stdout
    .filter((line) => line.startsWith(">")) // keep only lines that are commands
    .map((line) => line.slice(2).trim()) // remove the "> " prefix
}
