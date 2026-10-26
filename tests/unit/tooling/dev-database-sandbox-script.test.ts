/** @vitest-environment node */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadEnvConfig, resetEnv } from "@next/env";
import { beforeAll, describe, expect, it } from "vitest";

import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

type SandboxMode = "ensure" | "reset" | "delete";
type SandboxStep =
  | "createBranch"
  | "reuseBranch"
  | "resetBranch"
  | "deleteBranch"
  | "migrate"
  | "generateMessagingKeys"
  | "enrollMessagingKeys"
  | "writeEnvironment"
  | "removeEnvironment";
type NeonBranchSummary = {
  id: string;
  name: string;
  default?: boolean;
  primary?: boolean;
  protected?: boolean;
};

type DevDatabaseSandboxScript = {
  parseSandboxArguments: (scriptArguments: string[]) => {
    mode: SandboxMode;
    isDryRun: boolean;
  };
  resolveSandboxBranchName: (input: {
    branchNameOverride?: string;
    username: string;
  }) => string;
  planSandboxSteps: (input: {
    mode: SandboxMode;
    existingBranch: NeonBranchSummary | undefined;
    hasMessagingKeyrings?: boolean;
  }) => SandboxStep[];
  selectSandboxDatabase: (
    databases: { name: string; owner_name: string }[]
  ) => { databaseName: string; roleName: string };
  upsertSandboxEnvironment: (
    environmentFileText: string,
    connectionStrings: Record<string, string>
  ) => string;
  removeSandboxEnvironment: (environmentFileText: string) => string;
  redactConnectionString: (connectionString: string) => string;
  buildDevelopmentMessagingEnvironment: (generateBytes?: (size: number) => Buffer) => Record<string, string>;
  appendDevelopmentMessagingEnvironment: (environmentFileText: string, messagingEnvironment: Record<string, string>) => string;
};

const DIRECT_URL =
  "postgresql://neondb_owner:direct-secret@ep-sandbox.example.neon.tech/neondb?sslmode=require";
const SANDBOX_CONNECTION_STRINGS = {
  DATABASE_MAINTENANCE_URL: DIRECT_URL,
  DATABASE_MIGRATION_URL: DIRECT_URL,
  DATABASE_URL: DIRECT_URL,
};
const PREVIOUS_DATABASE_URL = "postgresql://previous-runtime";
const PREVIOUS_MIGRATION_URL = "postgresql://previous-migration";
const FILE_WITH_PREVIOUS_ASSIGNMENTS = [
  "BETTER_AUTH_URL=https://dev.tutribu.app",
  `DATABASE_URL=${PREVIOUS_DATABASE_URL}`,
  `DATABASE_MIGRATION_URL=${PREVIOUS_MIGRATION_URL}`,
  "MOCK_EXTERNAL_APIS=1",
  "",
].join("\n");

let sandboxScript: DevDatabaseSandboxScript;

/** Matches the variable name of each `KEY=value` assignment line in an env file. */
const ENVIRONMENT_ASSIGNMENT_KEY_PATTERN =
  /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm;

/**
 * Resolves the values Next.js applies from an env file with these contents,
 * through the real `@next/env` loader, and restores `process.env` afterwards.
 * The file is written as `.env` because the loader skips `.env.local` while
 * `NODE_ENV` is `test`; the precedence inside a single file is the same.
 */
function loadEffectiveEnvironment(environmentFileText: string) {
  const projectDirectory = mkdtempSync(join(tmpdir(), "dev-database-sandbox-"));
  // The loader never overrides variables already in process.env (CI sets DATABASE_URL, BETTER_AUTH_URL, ...),
  // so hide every key the file assigns while loading it.
  const assignedKeys = new Set(
    Array.from(
      environmentFileText.matchAll(ENVIRONMENT_ASSIGNMENT_KEY_PATTERN),
      (assignmentMatch) => assignmentMatch[1]
    )
  );
  const inheritedEnvironment = Object.fromEntries(
    Array.from(assignedKeys, (key) => [key, process.env[key]])
  );
  for (const key of assignedKeys) {
    delete process.env[key];
  }

  try {
    writeFileSync(join(projectDirectory, ".env"), environmentFileText);
    const { loadedEnvFiles } = loadEnvConfig(
      projectDirectory,
      true,
      { error: () => undefined, info: () => undefined },
      true
    );

    return loadedEnvFiles.find((envFile) => envFile.path === ".env")?.env ?? {};
  } finally {
    resetEnv();
    for (const [key, value] of Object.entries(inheritedEnvironment)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
    rmSync(projectDirectory, { force: true, recursive: true });
  }
}

describe("dev database sandbox script", () => {
  beforeAll(async () => {
    const importedModule = await import(
      "../../../scripts/dev-database-sandbox.mjs"
    );

    sandboxScript = importedModule as unknown as DevDatabaseSandboxScript;
  });

  describe("parseSandboxArguments", () => {
    it("should ensure the sandbox when no mode flag is given", () => {
      expect(sandboxScript.parseSandboxArguments([])).toEqual({
        isDryRun: false,
        mode: "ensure",
      });
    });

    it("should combine a mode flag with --dry-run", () => {
      expect(
        sandboxScript.parseSandboxArguments(["--reset", "--dry-run"])
      ).toEqual({ isDryRun: true, mode: "reset" });
      expect(sandboxScript.parseSandboxArguments(["--delete"])).toEqual({
        isDryRun: false,
        mode: "delete",
      });
    });

    it("should ignore the bare -- separator that pnpm forwards", () => {
      expect(sandboxScript.parseSandboxArguments(["--", "--reset"])).toEqual({
        isDryRun: false,
        mode: "reset",
      });
    });

    it("should reject conflicting modes and unknown flags", () => {
      expect(() =>
        sandboxScript.parseSandboxArguments(["--reset", "--delete"])
      ).toThrow(/--reset.*--delete/);
      expect(() => sandboxScript.parseSandboxArguments(["--force"])).toThrow(
        /--force/
      );
    });
  });

  describe("resolveSandboxBranchName", () => {
    it("should derive a stable, Neon-safe name from the OS username", () => {
      expect(
        sandboxScript.resolveSandboxBranchName({ username: "Guido.Modarelli" })
      ).toBe("dev-sandbox-guido-modarelli");
      expect(
        sandboxScript.resolveSandboxBranchName({ username: "Guido.Modarelli" })
      ).toBe(
        sandboxScript.resolveSandboxBranchName({ username: "Guido.Modarelli" })
      );
    });

    it("should prefer an explicit branch name override", () => {
      expect(
        sandboxScript.resolveSandboxBranchName({
          branchNameOverride: "  team-sandbox ",
          username: "guido",
        })
      ).toBe("team-sandbox");
    });

    it("should fail when the username has no usable characters", () => {
      expect(() =>
        sandboxScript.resolveSandboxBranchName({ username: "***" })
      ).toThrow(/NEON_DEV_BRANCH_NAME/);
    });
  });

  describe("planSandboxSteps", () => {
    const sandboxBranch = { id: "br-sandbox", name: "dev-sandbox-guido" };

    it("should create and migrate a missing sandbox, generating development messaging keys when none are configured", () => {
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: undefined,
          mode: "ensure",
        })
      ).toEqual(["createBranch", "migrate", "generateMessagingKeys", "enrollMessagingKeys", "writeEnvironment"]);
    });

    it("should reuse an existing sandbox and only apply pending migrations", () => {
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: sandboxBranch,
          mode: "ensure",
        })
      ).toEqual(["reuseBranch", "migrate", "generateMessagingKeys", "enrollMessagingKeys", "writeEnvironment"]);
    });

    it("should reset an existing sandbox from its parent, or create it when missing", () => {
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: sandboxBranch,
          mode: "reset",
        })
      ).toEqual(["resetBranch", "migrate", "generateMessagingKeys", "enrollMessagingKeys", "writeEnvironment"]);
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: undefined,
          mode: "reset",
        })
      ).toEqual(["createBranch", "migrate", "generateMessagingKeys", "enrollMessagingKeys", "writeEnvironment"]);
    });

    it("should still clean .env.local when deleting a sandbox that no longer exists", () => {
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: sandboxBranch,
          mode: "delete",
        })
      ).toEqual(["deleteBranch", "removeEnvironment"]);
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: undefined,
          mode: "delete",
        })
      ).toEqual(["removeEnvironment"]);
    });

    it("should only enroll configured messaging keys after migrating and before pointing .env.local at the sandbox", () => {
      for (const [existingBranch, mode, branchStep] of [
        [undefined, "ensure", "createBranch"],
        [sandboxBranch, "ensure", "reuseBranch"],
        [sandboxBranch, "reset", "resetBranch"],
      ] as const) {
        expect(
          sandboxScript.planSandboxSteps({
            existingBranch,
            hasMessagingKeyrings: true,
            mode,
          })
        ).toEqual([branchStep, "migrate", "enrollMessagingKeys", "writeEnvironment"]);
      }
    });

    it("should never enroll keys when deleting the sandbox", () => {
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: sandboxBranch,
          hasMessagingKeyrings: true,
          mode: "delete",
        })
      ).toEqual(["deleteBranch", "removeEnvironment"]);
    });

    it("should refuse to touch the default, primary or protected branch in any mode", () => {
      const forbiddenBranches = [
        { ...sandboxBranch, default: true },
        { ...sandboxBranch, primary: true },
        { ...sandboxBranch, protected: true },
      ];

      for (const existingBranch of forbiddenBranches) {
        for (const mode of ["ensure", "reset", "delete"] as const) {
          expect(() =>
            sandboxScript.planSandboxSteps({ existingBranch, mode })
          ).toThrow(/br-sandbox/);
        }
      }
    });
  });

  describe("development messaging keys", () => {
    it("should generate keyrings the real messaging security parser accepts, with independent material per purpose", async () => {
      const environment = sandboxScript.buildDevelopmentMessagingEnvironment();
      const config = await readMessagingHostingSecurityConfig(environment);
      expect(config.recoveryLocked).toBe(false);
      expect(Object.keys(config.keyrings).sort()).toEqual(Object.values(MESSAGING_KEY_PURPOSE).sort());
      const materials = Object.values(JSON.parse(environment.MESSAGING_KEYRINGS_JSON) as Record<string, { keys: { materialBase64: string }[] }>).map((keyring) => keyring.keys[0].materialBase64);
      expect(new Set(materials).size).toBe(materials.length);
    });

    it("should append the block once and keep existing keys, since enrolled proofs are bound to them", () => {
      const first = sandboxScript.appendDevelopmentMessagingEnvironment(FILE_WITH_PREVIOUS_ASSIGNMENTS, sandboxScript.buildDevelopmentMessagingEnvironment());
      const second = sandboxScript.appendDevelopmentMessagingEnvironment(first, sandboxScript.buildDevelopmentMessagingEnvironment());
      expect(second).toBe(first);
      expect(first.startsWith(FILE_WITH_PREVIOUS_ASSIGNMENTS)).toBe(true);
      expect(loadEffectiveEnvironment(first)).toMatchObject({ MESSAGING_RECOVERY_LOCK: "false", MESSAGING_SECURITY_ENVIRONMENT: "development", BETTER_AUTH_URL: "https://dev.tutribu.app" });
    });
  });

  describe("selectSandboxDatabase", () => {
    it("should prefer neondb and connect as its owner", () => {
      expect(
        sandboxScript.selectSandboxDatabase([
          { name: "analytics", owner_name: "analyst" },
          { name: "neondb", owner_name: "neondb_owner" },
        ])
      ).toEqual({ databaseName: "neondb", roleName: "neondb_owner" });
    });

    it("should fall back to the only database of the branch", () => {
      expect(
        sandboxScript.selectSandboxDatabase([
          { name: "tutribu", owner_name: "tutribu_owner" },
        ])
      ).toEqual({ databaseName: "tutribu", roleName: "tutribu_owner" });
    });

    it("should fail when the branch has no database", () => {
      expect(() => sandboxScript.selectSandboxDatabase([])).toThrow(
        /database/
      );
    });
  });

  describe("sandbox environment block", () => {
    it("should make the sandbox effective while keeping earlier assignments in the file", () => {
      const updatedFileText = sandboxScript.upsertSandboxEnvironment(
        FILE_WITH_PREVIOUS_ASSIGNMENTS,
        SANDBOX_CONNECTION_STRINGS
      );
      const effectiveEnvironment = loadEffectiveEnvironment(updatedFileText);

      expect(effectiveEnvironment.DATABASE_URL).toBe(DIRECT_URL);
      expect(effectiveEnvironment.DATABASE_MIGRATION_URL).toBe(DIRECT_URL);
      expect(effectiveEnvironment.DATABASE_MAINTENANCE_URL).toBe(DIRECT_URL);
      expect(effectiveEnvironment.BETTER_AUTH_URL).toBe("https://dev.tutribu.app");
      expect(effectiveEnvironment.MOCK_EXTERNAL_APIS).toBe("1");
      expect(updatedFileText.startsWith(FILE_WITH_PREVIOUS_ASSIGNMENTS)).toBe(true);
    });

    it("should be idempotent across repeated runs and preserve CRLF files", () => {
      const originalFileText = "BETTER_AUTH_URL=https://dev.tutribu.app\r\n";
      const firstRun = sandboxScript.upsertSandboxEnvironment(
        originalFileText,
        SANDBOX_CONNECTION_STRINGS
      );
      const secondRun = sandboxScript.upsertSandboxEnvironment(
        firstRun,
        SANDBOX_CONNECTION_STRINGS
      );

      expect(secondRun).toBe(firstRun);
      expect(firstRun.split("\r\n").length).toBeGreaterThan(1);
      expect(firstRun.replace(/\r\n/g, "")).not.toContain("\n");
    });

    it("should restore the assignments made before the sandbox when the block is removed", () => {
      const sandboxFileText = sandboxScript.upsertSandboxEnvironment(
        FILE_WITH_PREVIOUS_ASSIGNMENTS,
        SANDBOX_CONNECTION_STRINGS
      );

      const cleanedFileText =
        sandboxScript.removeSandboxEnvironment(sandboxFileText);
      const effectiveEnvironment = loadEffectiveEnvironment(cleanedFileText);

      expect(cleanedFileText).toBe(FILE_WITH_PREVIOUS_ASSIGNMENTS);
      expect(effectiveEnvironment.DATABASE_URL).toBe(PREVIOUS_DATABASE_URL);
      expect(effectiveEnvironment.DATABASE_MIGRATION_URL).toBe(PREVIOUS_MIGRATION_URL);
      expect(effectiveEnvironment.DATABASE_MAINTENANCE_URL).toBeUndefined();
    });

    it("should leave no database variable when the file had none before the sandbox", () => {
      const sandboxFileText = sandboxScript.upsertSandboxEnvironment(
        "BETTER_AUTH_URL=https://dev.tutribu.app\n",
        SANDBOX_CONNECTION_STRINGS
      );

      const cleanedFileText =
        sandboxScript.removeSandboxEnvironment(sandboxFileText);

      expect(cleanedFileText).toBe("BETTER_AUTH_URL=https://dev.tutribu.app\n");
    });
  });

  describe("redactConnectionString", () => {
    it("should hide the password and query while keeping what identifies the target", () => {
      const redacted = sandboxScript.redactConnectionString(DIRECT_URL);

      expect(redacted).not.toContain("direct-secret");
      expect(redacted).not.toContain("sslmode");
      expect(redacted).toContain("neondb_owner");
      expect(redacted).toContain("ep-sandbox.example.neon.tech");
      expect(redacted).toContain("/neondb");
    });

    it("should never echo a value it cannot parse", () => {
      expect(sandboxScript.redactConnectionString("not a url secret")).not.toContain(
        "secret"
      );
    });
  });
});
