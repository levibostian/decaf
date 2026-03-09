import { defineStore } from "@david/service-store"
import * as githubApi from "./github-api.ts"
import { createGitRepoManager, GitRepoManager } from "./git.ts"
import { Environment, EnvironmentImpl } from "./environment.ts"
import { Exec, ExecImpl } from "./exec.ts"
import { Logger } from "./log.ts"

export const productionDiDefinition = defineStore()
  .add("logger", (): Logger => new Logger())
  .add("exec", (store): Exec => new ExecImpl(store.get("logger")))
  .add("gitRepoManager", (store): GitRepoManager => createGitRepoManager(store.get("exec"), store.get("logger")))
  .add("github", () => githubApi.impl())
  .add("environment", (store): Environment => new EnvironmentImpl(store.get("github"), store.get("logger"), store.get("exec")))

export const productionDiGraph = productionDiDefinition

let diGraphToUseAtRuntime = productionDiGraph

export const overrideStore = (override: typeof productionDiGraph) => {
  // Override the production store with the provided store
  diGraphToUseAtRuntime = override
}

export const clearOverride = () => {
  // Clear any overrides and revert to the production store
  diGraphToUseAtRuntime = productionDiGraph
}

export const getGraph = () => diGraphToUseAtRuntime.finalize()
