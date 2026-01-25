import { parseArgs } from "@std/cli/parse-args"

// Tested in environment.test.ts
export const processCommandLineArgs = (cmdArgs: string[]) => {
  const args = parseArgs(cmdArgs, {
    string: [
      "github_token",
      "git_config",
      "simulated_merge_type",
      "output_file",
      "make_pull_request_comment",
      "fail_on_deploy_verification",
      "debug",
      "branch_filters",
      "commit_limit",
      "pull_request_comment_template_file",
      "pull_request_comment_template",
      "current_working_directory",
    ],
    // collect: allows repeatable flags (e.g., --deploy staging --deploy prod) -> returns array
    collect: [
      "deploy",
      "get_latest_release_current_branch",
      "get_next_release_version",
    ],
    default: {
      github_token: "",
      git_config: "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
      deploy: [],
      get_latest_release_current_branch: [],
      get_next_release_version: [],
      simulated_merge_type: "",
      output_file: "",
      make_pull_request_comment: "true",
      fail_on_deploy_verification: "true",
      debug: "false",
      branch_filters: "",
      commit_limit: "",
      pull_request_comment_template_file: "",
      pull_request_comment_template: "",
      current_working_directory: "",
    },
  })

  // Inject CLI args into environment variables for downstream code
  Deno.env.set("INPUT_GITHUB_TOKEN", args.github_token)
  Deno.env.set("INPUT_GIT_CONFIG", args.git_config)
  Deno.env.set("INPUT_DEPLOY", args.deploy.join("\n"))
  Deno.env.set("INPUT_GET_LATEST_RELEASE_CURRENT_BRANCH", args.get_latest_release_current_branch.join("\n"))
  Deno.env.set("INPUT_GET_NEXT_RELEASE_VERSION", args.get_next_release_version.join("\n"))
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", args.simulated_merge_type)
  Deno.env.set("INPUT_OUTPUT_FILE", args.output_file)
  Deno.env.set("INPUT_MAKE_PULL_REQUEST_COMMENT", args.make_pull_request_comment)
  Deno.env.set("INPUT_FAIL_ON_DEPLOY_VERIFICATION", args.fail_on_deploy_verification)
  Deno.env.set("INPUT_DEBUG", args.debug)
  Deno.env.set("INPUT_BRANCH_FILTERS", args.branch_filters)
  Deno.env.set("INPUT_COMMIT_LIMIT", args.commit_limit)
  Deno.env.set("INPUT_PULL_REQUEST_COMMENT_TEMPLATE_FILE", args.pull_request_comment_template_file)
  Deno.env.set("INPUT_PULL_REQUEST_COMMENT_TEMPLATE", args.pull_request_comment_template)
  Deno.env.set("INPUT_CURRENT_WORKING_DIRECTORY", args.current_working_directory)
}
