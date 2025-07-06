import { parseArgs } from "@std/cli/parse-args"

// Tested in environment.test.ts
export const processCommandLineArgs = (cmdArgs: string[]) => {
  const args = parseArgs(cmdArgs, {
    string: [
      "github_token",
      "git_config",
      "deploy",
      "get_latest_release_current_branch",
      "get_next_release_version",
      "simulated_merge_type",
      "output_file",
      "make_pull_request_comment",
      "fail_on_deploy_verification",
      "debug",
    ],
    default: {
      github_token: "",
      git_config: "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
      deploy: "",
      get_latest_release_current_branch: "",
      get_next_release_version: "",
      simulated_merge_type: "merge",
      output_file: "",
      make_pull_request_comment: "true",
      fail_on_deploy_verification: "true",
      debug: "false",
    },
  })

  // Inject CLI args into environment variables for downstream code
  Deno.env.set("INPUT_GITHUB_TOKEN", args.github_token)
  Deno.env.set("INPUT_GIT_CONFIG", args.git_config)
  Deno.env.set("INPUT_DEPLOY", args.deploy)
  Deno.env.set("INPUT_GET_LATEST_RELEASE_CURRENT_BRANCH", args.get_latest_release_current_branch)
  Deno.env.set("INPUT_GET_NEXT_RELEASE_VERSION", args.get_next_release_version)
  Deno.env.set("INPUT_SIMULATED_MERGE_TYPE", args.simulated_merge_type)
  Deno.env.set("INPUT_OUTPUT_FILE", args.output_file)
  Deno.env.set("INPUT_MAKE_PULL_REQUEST_COMMENT", args.make_pull_request_comment)
  Deno.env.set("INPUT_FAIL_ON_DEPLOY_VERIFICATION", args.fail_on_deploy_verification)
  Deno.env.set("INPUT_DEBUG", args.debug)
}
