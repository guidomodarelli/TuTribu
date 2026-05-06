/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";

type PushMigrationsScript = {
  buildDrizzleKitCommand: (scriptArguments?: string[]) => {
    command: string;
    commandArguments: string[];
  };
  buildDrizzleKitArguments: (scriptArguments?: string[]) => string[];
  normalizeScriptArguments: (scriptArguments?: string[]) => {
    passthroughArguments: string[];
    shouldForcePush: boolean;
  };
};

let pushMigrationsScript: PushMigrationsScript;

function readWorkspaceJson<TValue>(relativePath: string): TValue {
  return JSON.parse(readFileSync(path.join(process.cwd(), relativePath), "utf8")) as TValue;
}

describe("push migrations script", () => {
  beforeAll(async () => {
    const importedModule = await import("../../../scripts/push-migrations.js");

    pushMigrationsScript = (importedModule.default ?? importedModule) as PushMigrationsScript;
  });

  it("should run versioned migrations by default", () => {
    expect(pushMigrationsScript.buildDrizzleKitArguments([])).toEqual([
      "drizzle-kit",
      "migrate",
      "--config",
      "drizzle.config.ts",
    ]);
  });

  it("should run a forced schema push when force is requested", () => {
    expect(pushMigrationsScript.buildDrizzleKitArguments(["--force"])).toEqual([
      "drizzle-kit",
      "push",
      "--config",
      "drizzle.config.ts",
      "--force",
    ]);
  });

  it("should execute the local Drizzle Kit CLI through Node", () => {
    expect(pushMigrationsScript.buildDrizzleKitCommand(["--force"])).toEqual({
      command: process.execPath,
      commandArguments: [
        "node_modules/drizzle-kit/bin.cjs",
        "push",
        "--config",
        "drizzle.config.ts",
        "--force",
      ],
    });
  });

  it("should preserve extra Drizzle arguments after selecting force mode", () => {
    expect(
      pushMigrationsScript.normalizeScriptArguments(["--force", "--verbose"])
    ).toEqual({
      passthroughArguments: ["--verbose"],
      shouldForcePush: true,
    });
  });

  it("should expose migration commands from package scripts", () => {
    const packageJson = readWorkspaceJson<{
      scripts: Record<string, string>;
    }>("package.json");

    expect(packageJson.scripts["db:migrate"]).toBe("node scripts/push-migrations.js");
    expect(packageJson.scripts["db:migrate:force"]).toBe(
      "node scripts/push-migrations.js --force"
    );
  });
});
