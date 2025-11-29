import { defineStore } from "@david/service-store"
import * as githubApi from "./github-api.ts"
import * as git from "./git.ts"
import { Environment, EnvironmentImpl } from "./environment.ts"

export const productionDiDefinition = defineStore()
  .add("git", git.impl)
  .add("github", githubApi.impl)
  .add("environment", (store): Environment => new EnvironmentImpl(store.get("github")))

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
