# AGENTS.md

## Build Commands
- **Test all**: `deno task test` (runs with coverage and JUnit output)
- **Test single file**: `deno test --allow-all path/to/file.test.ts`
- **Update snapshots**: `deno task test-update`
- **Lint**: `deno task lint` (auto-fixes issues)
- **Compile**: `deno task compile` (requires OUTPUT_FILE_NAME and DENO_TARGET env vars)

### Quality Assurance
- **IMPORTANT**: Every time you run the full test suite (`deno task test`) to verify all tests pass, you MUST also run the linter (`deno task lint`) to ensure no new lint errors have been introduced

## Deno v2 Project Notes
- This is a Deno v2 project using JSR for external dependencies
- All external packages should be imported from JSR (e.g., `@std/cli`, `@david/dax`)
- Use `deno.json` for configuration and task definitions

## Code Style Guidelines

### Imports & Dependencies
- Use JSR imports for external packages (e.g., `@std/cli`, `@david/dax`)
- Use relative imports for internal modules (e.g., `./exec.ts`)
- Import order: external JSR packages → npm packages → local modules

### Formatting & Types
- Line width: 150 characters
- No semicolons (configured in deno.json)
- Use TypeScript interfaces for all public APIs
- Use type guards for runtime type checking (see `lib/steps/types/output.ts`)
- Prefer explicit return types for public functions

### Naming Conventions
- Classes: PascalCase with `Impl` suffix for implementations (e.g., `ConvenienceStepImpl`)
- Functions: camelCase
- Interfaces: PascalCase, no `I` prefix
- Files: kebab-case for implementation files, camelCase for type files
- Constants: UPPER_SNAKE_CASE

### Error Handling
- Use try/catch for expected error conditions
- Log errors with appropriate context using the logger
- Re-throw errors after logging when appropriate
- Use Result-like patterns for operations that can fail

### Testing
- Use `@std/assert` for assertions
- Test files end with `.test.ts`
- Use descriptive test names that describe the behavior
- Create fake/test data classes for complex objects (see `GitCommitFake`)
