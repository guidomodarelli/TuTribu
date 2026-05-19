/** @jest-environment node */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type PushMigrationsScript = {
  buildGrantRuntimeRoleSql: (runtimeDatabaseUser: string | undefined) => string | undefined;
  buildDrizzleKitCommand: (scriptArguments?: string[]) => {
    command: string;
    commandArguments: string[];
  };
  buildDrizzleKitArguments: (scriptArguments?: string[]) => string[];
  getDatabaseUrlRuntimeRoleName: (
    environment?: NodeJS.ProcessEnv
  ) => string | undefined;
  loadDatabaseEnvironmentFiles: () => Promise<void>;
  normalizeScriptArguments: (scriptArguments?: string[]) => {
    passthroughArguments: string[];
    shouldForcePush: boolean;
  };
  shouldBlockForcePush: (environment?: NodeJS.ProcessEnv) => boolean;
  shouldLoadDevelopmentEnvironmentFiles: (
    environment?: NodeJS.ProcessEnv
  ) => boolean;
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

  it("should block forced schema pushes unless explicitly allowed", () => {
    expect(pushMigrationsScript.shouldBlockForcePush({})).toBe(true);
    expect(
      pushMigrationsScript.shouldBlockForcePush({
        ALLOW_UNSAFE_DRIZZLE_FORCE_PUSH: "true",
      })
    ).toBe(false);
  });

  it("should read the runtime database user from DATABASE_URL", () => {
    expect(
      pushMigrationsScript.getDatabaseUrlRuntimeRoleName({
        DATABASE_URL:
          "postgresql://runtime-user:password@example.test/runtime?sslmode=require",
      })
    ).toBe("runtime-user");
  });

  it("should build an escaped grant for the runtime database user", () => {
    expect(
      pushMigrationsScript.buildGrantRuntimeRoleSql('runtime"user')
    ).toBe('GRANT tutribu_rls_app TO "runtime""user"');
  });

  it("should load database URLs from local environment files", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousDatabaseMigrationUrl = process.env.DATABASE_MIGRATION_URL;
    const previousNodeEnvironment = process.env.NODE_ENV;
    const previousWorkingDirectory = process.cwd();
    const temporaryWorkspace = mkdtempSync(path.join(os.tmpdir(), "tutribu-migrations-"));

    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_MIGRATION_URL;
    process.env.NODE_ENV = "development";
    writeFileSync(
      path.join(temporaryWorkspace, ".env.local"),
      [
        "DATABASE_URL=postgresql://runtime-user:password@example.test/runtime",
        "DATABASE_MIGRATION_URL=postgresql://migration-user:password@example.test/migration",
      ].join("\n"),
      "utf8"
    );

    process.chdir(temporaryWorkspace);

    try {
      await pushMigrationsScript.loadDatabaseEnvironmentFiles();

      expect(process.env.DATABASE_URL).toBe(
        "postgresql://runtime-user:password@example.test/runtime"
      );
      expect(process.env.DATABASE_MIGRATION_URL).toBe(
        "postgresql://migration-user:password@example.test/migration"
      );
    } finally {
      process.chdir(previousWorkingDirectory);

      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }

      if (previousDatabaseMigrationUrl === undefined) {
        delete process.env.DATABASE_MIGRATION_URL;
      } else {
        process.env.DATABASE_MIGRATION_URL = previousDatabaseMigrationUrl;
      }

      if (previousNodeEnvironment === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnvironment;
      }

      rmSync(temporaryWorkspace, { force: true, recursive: true });
    }
  });

  it("should load production database URLs when migrations run outside development", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousDatabaseMigrationUrl = process.env.DATABASE_MIGRATION_URL;
    const previousNodeEnvironment = process.env.NODE_ENV;
    const previousWorkingDirectory = process.cwd();
    const temporaryWorkspace = mkdtempSync(path.join(os.tmpdir(), "tutribu-migrations-"));

    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_MIGRATION_URL;
    process.env.NODE_ENV = "production";
    writeFileSync(
      path.join(temporaryWorkspace, ".env.development"),
      [
        "DATABASE_URL=postgresql://development-runtime:password@example.test/runtime",
        "DATABASE_MIGRATION_URL=postgresql://development-migration:password@example.test/migration",
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      path.join(temporaryWorkspace, ".env.production"),
      [
        "DATABASE_URL=postgresql://production-runtime:password@example.test/runtime",
        "DATABASE_MIGRATION_URL=postgresql://production-migration:password@example.test/migration",
      ].join("\n"),
      "utf8"
    );

    process.chdir(temporaryWorkspace);

    try {
      await pushMigrationsScript.loadDatabaseEnvironmentFiles();

      expect(process.env.DATABASE_URL).toBe(
        "postgresql://production-runtime:password@example.test/runtime"
      );
      expect(process.env.DATABASE_MIGRATION_URL).toBe(
        "postgresql://production-migration:password@example.test/migration"
      );
    } finally {
      process.chdir(previousWorkingDirectory);

      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }

      if (previousDatabaseMigrationUrl === undefined) {
        delete process.env.DATABASE_MIGRATION_URL;
      } else {
        process.env.DATABASE_MIGRATION_URL = previousDatabaseMigrationUrl;
      }

      if (previousNodeEnvironment === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnvironment;
      }

      rmSync(temporaryWorkspace, { force: true, recursive: true });
    }
  });

  it("should only force the development environment file chain in development", () => {
    expect(
      pushMigrationsScript.shouldLoadDevelopmentEnvironmentFiles({
        NODE_ENV: "development",
      })
    ).toBe(true);
    expect(
      pushMigrationsScript.shouldLoadDevelopmentEnvironmentFiles({
        NODE_ENV: "production",
      })
    ).toBe(false);
    expect(pushMigrationsScript.shouldLoadDevelopmentEnvironmentFiles({})).toBe(false);
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
