# AGENTS.md

## Build Commands
- **Test all**: `deno task test > /dev/null 2>&1` (silenced, read `reports/junit.xml` for results)
- **Test single file**: `deno test --allow-all path/to/file.test.ts` (direct output)
- **Update snapshots**: `deno task test-update`
- **Lint**: `deno task lint` (auto-fixes issues)
- **Compile**: `deno task compile` (requires OUTPUT_FILE_NAME and DENO_TARGET env vars)