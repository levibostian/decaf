import {
  assertEquals,
  assertFalse,
  assertRejects,
} from "jsr:@std/assert@1";
import { afterEach, before, beforeEach, describe, it } from "jsr:@std/testing@1/bdd";
import {
  assertSpyCall,
  restore,
  Stub,
  stub,
} from "jsr:@std/testing@1/mock";
import { exec, RunResult } from "./exec.ts";
import { SimulateMerge, SimulateMergeImpl } from "./simulate-merge.ts"
import { git } from "./git.ts";
import { Exec } from "./exec.ts";
import { assertSnapshot } from "jsr:@std/testing@1/snapshot";

describe("snapshot test all of the merge options", () => {
  let simulateMerge: SimulateMerge;
  let execMock: Stub<Exec>;

  beforeEach(() => {
    execMock = stub(exec, "run", async (args) => {
      // rev-list expects to return a number of commits
      if (args.command.includes("git rev-list")) {
        return { exitCode: 0, stdout: "3", output: undefined };
      }

      return { exitCode: 0, stdout: "success", output: undefined };
    });
    simulateMerge = new SimulateMergeImpl(git, exec);
  })

  afterEach(() => {
    restore();
  });

  it("merge, should generate the correct git commands", async (t) => {
    await simulateMerge.merge({
      baseBranch: "feature",
      targetBranch: "main",
      commitTitle: "title-here",
      commitMessage: "message-here",
    });

    await assertSnapshot(t, execMock.calls.map((call) => call.args[0].command ));
  });

  it("squash, should generate the correct git commands", async (t) => {
    await simulateMerge.squash({
      baseBranch: "feature",
      targetBranch: "main",
      commitTitle: "title-here",
      commitMessage: "message-here",
    });

    await assertSnapshot(t, execMock.calls.map((call) => call.args[0].command ));
  });

  it("rebase, should generate the correct git commands", async (t) => {
    await simulateMerge.rebase({
      baseBranch: "feature",
      targetBranch: "main",
      commitTitle: "title-here",
      commitMessage: "message-here",
    });

    await assertSnapshot(t, execMock.calls.map((call) => call.args[0].command ));
  });
});
