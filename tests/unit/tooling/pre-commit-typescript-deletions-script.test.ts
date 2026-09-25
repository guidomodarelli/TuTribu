/** @vitest-environment node */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

type StagedTypeScriptChanges = {
  deletedPaths: string[];
  nonDeletedPaths: string[];
};

type PreCommitTypeScriptDeletionsScript = {
  listStagedTypeScriptChanges: (
    repositoryRoot: string,
    environment?: NodeJS.ProcessEnv
  ) => StagedTypeScriptChanges;
  shouldRunTypeChecksForDeletions: (changes: StagedTypeScriptChanges) => boolean;
};

type PrePushGateScript = {
  buildRepositoryIndependentEnvironment: (
    environment?: Record<string, string | undefined>
  ) => NodeJS.ProcessEnv;
};

const SCRIPT_PATH = path.resolve("scripts", "pre-commit-typescript-deletions.mjs");
const INSTALLED_MODULES_PATH = path.resolve("node_modules");
const DIRECTORY_LINK_TYPE = process.platform === "win32" ? "junction" : "dir";
const HOOK_TIMEOUT_MS = 120_000;

const SHARED_MODULE_PATH = "src/shared.ts";
const CONSUMER_MODULE_PATH = "src/consumer.ts";
const UNUSED_MODULE_PATH = "src/unused.ts";

let deletionsScript: PreCommitTypeScriptDeletionsScript;
let repositoryIndependentEnvironment: NodeJS.ProcessEnv;
const temporaryDirectories: string[] = [];

function runGit(gitArguments: string[], workingDirectory: string): string {
  // Hooks export GIT_DIR/GIT_INDEX_FILE; fixtures must target their own repository.
  const result = spawnSync("git", gitArguments, {
    cwd: workingDirectory,
    encoding: "utf8",
    env: repositoryIndependentEnvironment,
  });

  if (result.status !== 0) {
    throw new Error(`git ${gitArguments.join(" ")} failed: ${result.stderr}`);
  }

  return result.stdout.trim();
}

/**
 * Creates a Git repository with a TypeScript project whose `typecheck` scripts
 * run the real compiler, and installs this script as its `pre-commit` hook.
 */
function createTypeScriptRepository(): string {
  const repositoryRoot = mkdtempSync(
    path.join(os.tmpdir(), "pre-commit-typescript-deletions-test-")
  );
  temporaryDirectories.push(repositoryRoot);

  runGit(["init", "--quiet"], repositoryRoot);
  runGit(["config", "user.email", "gate@example.test"], repositoryRoot);
  runGit(["config", "user.name", "Gate Test"], repositoryRoot);
  runGit(["config", "commit.gpgsign", "false"], repositoryRoot);
  runGit(["config", "core.autocrlf", "false"], repositoryRoot);
  runGit(["config", "core.hooksPath", "hooks"], repositoryRoot);

  mkdirSync(path.join(repositoryRoot, "src"), { recursive: true });
  mkdirSync(path.join(repositoryRoot, "hooks"), { recursive: true });
  writeFileSync(
    path.join(repositoryRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "typescript-deletions-fixture",
        private: true,
        scripts: {
          typecheck: "tsc --noEmit -p tsconfig.json",
          "typecheck:tests": "tsc --noEmit -p tsconfig.json",
        },
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    path.join(repositoryRoot, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "es2022",
          module: "esnext",
          moduleResolution: "bundler",
          skipLibCheck: true,
          types: [],
        },
        include: ["src/**/*.ts"],
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    path.join(repositoryRoot, SHARED_MODULE_PATH),
    "export const sharedValue = 1;\n"
  );
  writeFileSync(
    path.join(repositoryRoot, CONSUMER_MODULE_PATH),
    'import { sharedValue } from "./shared";\n\nexport const consumerValue = sharedValue + 1;\n'
  );
  writeFileSync(
    path.join(repositoryRoot, UNUSED_MODULE_PATH),
    "export const unusedValue = 1;\n"
  );
  writeFileSync(path.join(repositoryRoot, "README.md"), "fixture\n");
  writeFileSync(path.join(repositoryRoot, ".gitignore"), "node_modules\n");
  const nodeExecutable = process.execPath.replaceAll("\\", "/");
  const hookScript = SCRIPT_PATH.replaceAll("\\", "/");
  writeFileSync(
    path.join(repositoryRoot, "hooks", "pre-commit"),
    `#!/bin/sh\n"${nodeExecutable}" "${hookScript}"\n`,
    { mode: 0o755 }
  );
  symlinkSync(
    INSTALLED_MODULES_PATH,
    path.join(repositoryRoot, "node_modules"),
    DIRECTORY_LINK_TYPE
  );
  runGit(["add", "."], repositoryRoot);
  runGit(["commit", "--quiet", "--no-verify", "-m", "initial"], repositoryRoot);

  return repositoryRoot;
}

function commitThroughHook(repositoryRoot: string) {
  return spawnSync("git", ["commit", "--quiet", "-m", "remove module"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: repositoryIndependentEnvironment,
  });
}

describe("pre-commit TypeScript deletions script", () => {
  beforeAll(async () => {
    const prePushGateScript = (await import(
      "../../../scripts/pre-push-gate.mjs"
    )) as unknown as PrePushGateScript;
    repositoryIndependentEnvironment =
      prePushGateScript.buildRepositoryIndependentEnvironment();
    deletionsScript = (await import(
      "../../../scripts/pre-commit-typescript-deletions.mjs"
    )) as unknown as PreCommitTypeScriptDeletionsScript;
  });

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      // Unlink the node_modules link first so removal never walks into it.
      const linkedModulesPath = path.join(directory, "node_modules");
      if (lstatSync(linkedModulesPath, { throwIfNoEntry: false })?.isSymbolicLink()) {
        unlinkSync(linkedModulesPath);
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it(
    "should block a commit that only deletes an imported TypeScript file",
    () => {
      const repositoryRoot = createTypeScriptRepository();
      const initialHead = runGit(["rev-parse", "HEAD"], repositoryRoot);
      runGit(["rm", "--quiet", SHARED_MODULE_PATH], repositoryRoot);

      const commitResult = commitThroughHook(repositoryRoot);

      expect(commitResult.status).not.toBe(0);
      expect(commitResult.stderr).toContain(CONSUMER_MODULE_PATH);
      expect(runGit(["rev-parse", "HEAD"], repositoryRoot)).toBe(initialHead);
    },
    HOOK_TIMEOUT_MS
  );

  it(
    "should block the deletion even when an untracked file recreates it",
    () => {
      const repositoryRoot = createTypeScriptRepository();
      const initialHead = runGit(["rev-parse", "HEAD"], repositoryRoot);
      runGit(["rm", "--quiet", SHARED_MODULE_PATH], repositoryRoot);
      // The live checkout still type-checks; the committed tree does not.
      writeFileSync(
        path.join(repositoryRoot, SHARED_MODULE_PATH),
        "export const sharedValue = 1;\n"
      );

      const commitResult = commitThroughHook(repositoryRoot);

      expect(commitResult.status).not.toBe(0);
      expect(commitResult.stderr).toContain(CONSUMER_MODULE_PATH);
      expect(runGit(["rev-parse", "HEAD"], repositoryRoot)).toBe(initialHead);
    },
    HOOK_TIMEOUT_MS
  );

  it(
    "should allow a commit that deletes an unused TypeScript file",
    () => {
      const repositoryRoot = createTypeScriptRepository();
      const initialHead = runGit(["rev-parse", "HEAD"], repositoryRoot);
      runGit(["rm", "--quiet", UNUSED_MODULE_PATH], repositoryRoot);

      const commitResult = commitThroughHook(repositoryRoot);

      expect(commitResult.status).toBe(0);
      // Git forwards hook output to stderr: the type checks did run.
      expect(commitResult.stderr).toContain("running typecheck and typecheck:tests");
      expect(runGit(["rev-parse", "HEAD"], repositoryRoot)).not.toBe(initialHead);
    },
    HOOK_TIMEOUT_MS
  );

  it("should leave mixed TypeScript commits to the lint-staged type checks", () => {
    const repositoryRoot = createTypeScriptRepository();
    runGit(["rm", "--quiet", UNUSED_MODULE_PATH], repositoryRoot);
    writeFileSync(
      path.join(repositoryRoot, CONSUMER_MODULE_PATH),
      "export const consumerValue = 2;\n"
    );
    runGit(["add", CONSUMER_MODULE_PATH], repositoryRoot);

    const changes = deletionsScript.listStagedTypeScriptChanges(
      repositoryRoot,
      repositoryIndependentEnvironment
    );

    expect(changes).toEqual({
      deletedPaths: [UNUSED_MODULE_PATH],
      nonDeletedPaths: [CONSUMER_MODULE_PATH],
    });
    expect(deletionsScript.shouldRunTypeChecksForDeletions(changes)).toBe(false);
  });

  it("should ignore deletions of files that are not TypeScript", () => {
    const repositoryRoot = createTypeScriptRepository();
    runGit(["rm", "--quiet", "README.md"], repositoryRoot);
    // Unstaged deletions are not part of the commit.
    unlinkSync(path.join(repositoryRoot, UNUSED_MODULE_PATH));

    const changes = deletionsScript.listStagedTypeScriptChanges(
      repositoryRoot,
      repositoryIndependentEnvironment
    );

    expect(changes).toEqual({ deletedPaths: [], nonDeletedPaths: [] });
    expect(deletionsScript.shouldRunTypeChecksForDeletions(changes)).toBe(false);
  });
});
