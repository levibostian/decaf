import { assertEquals } from "@std/assert"
import { processCommandLineArgs } from "../../cli.ts"
import { EnvironmentImpl } from "../environment.ts"

Deno.test("getUserConfigurationOptions - expect get from command line argument", async () => {
  const environment = new EnvironmentImpl()

  processCommandLineArgs([
    "--fail_on_deploy_verification=true",
    "--make_pull_request_comment=true",
  ])

  assertEquals(environment.getUserConfigurationOptions().failOnDeployVerification, true)
  assertEquals(environment.getUserConfigurationOptions().makePullRequestComment, true)

  processCommandLineArgs([
    "--fail_on_deploy_verification=false",
    "--make_pull_request_comment=false",
  ])

  assertEquals(environment.getUserConfigurationOptions().failOnDeployVerification, false)
  assertEquals(environment.getUserConfigurationOptions().makePullRequestComment, false)
})

Deno.test("getGitConfigInput - expect get from command line argument", async () => {
  const environment = new EnvironmentImpl()

  processCommandLineArgs([
    "--git_config=Test User <test@example.com>",
  ])

  assertEquals(environment.getGitConfigInput()?.name, "Test User")
  assertEquals(environment.getGitConfigInput()?.email, "test@example.com")
})
