/** @vitest-environment node */

import { beforeAll, describe, expect, it } from "vitest";

type SandboxMode = "ensure" | "reset" | "delete";
type SandboxStep =
  | "createBranch"
  | "reuseBranch"
  | "resetBranch"
  | "deleteBranch"
  | "migrate"
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
};

const RUNTIME_URL =
  "postgresql://neondb_owner:runtime-secret@ep-sandbox-pooler.example.neon.tech/neondb?sslmode=require";
const DIRECT_URL =
  "postgresql://neondb_owner:direct-secret@ep-sandbox.example.neon.tech/neondb?sslmode=require";
const SANDBOX_CONNECTION_STRINGS = {
  DATABASE_MAINTENANCE_URL: DIRECT_URL,
  DATABASE_MIGRATION_URL: DIRECT_URL,
  DATABASE_URL: RUNTIME_URL,
};

let sandboxScript: DevDatabaseSandboxScript;

/**
 * Reads every `KEY=value` assignment of an env file the way a dotenv loader
 * does: the last assignment of a key wins.
 */
function readEnvironmentAssignments(environmentFileText: string) {
  const assignments = new Map<string, string>();

  for (const line of environmentFileText.split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);

    if (match) {
      assignments.set(match[1], match[2]);
    }
  }

  return assignments;
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

    it("should create and migrate a missing sandbox", () => {
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: undefined,
          mode: "ensure",
        })
      ).toEqual(["createBranch", "migrate", "writeEnvironment"]);
    });

    it("should reuse an existing sandbox and only apply pending migrations", () => {
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: sandboxBranch,
          mode: "ensure",
        })
      ).toEqual(["reuseBranch", "migrate", "writeEnvironment"]);
    });

    it("should reset an existing sandbox from its parent, or create it when missing", () => {
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: sandboxBranch,
          mode: "reset",
        })
      ).toEqual(["resetBranch", "migrate", "writeEnvironment"]);
      expect(
        sandboxScript.planSandboxSteps({
          existingBranch: undefined,
          mode: "reset",
        })
      ).toEqual(["createBranch", "migrate", "writeEnvironment"]);
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
    it("should point every database variable at the sandbox and keep unrelated settings", () => {
      const originalFileText = [
        "BETTER_AUTH_URL=https://dev.tutribu.app",
        "DATABASE_URL=postgresql://shared",
        "MOCK_EXTERNAL_APIS=1",
        "",
      ].join("\n");

      const updatedFileText = sandboxScript.upsertSandboxEnvironment(
        originalFileText,
        SANDBOX_CONNECTION_STRINGS
      );
      const assignments = readEnvironmentAssignments(updatedFileText);

      expect(assignments.get("DATABASE_URL")).toBe(RUNTIME_URL);
      expect(assignments.get("DATABASE_MIGRATION_URL")).toBe(DIRECT_URL);
      expect(assignments.get("DATABASE_MAINTENANCE_URL")).toBe(DIRECT_URL);
      expect(assignments.get("BETTER_AUTH_URL")).toBe(
        "https://dev.tutribu.app"
      );
      expect(assignments.get("MOCK_EXTERNAL_APIS")).toBe("1");
      expect(updatedFileText).not.toContain("postgresql://shared");
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

    it("should remove the sandbox variables so the app falls back to .env", () => {
      const sandboxFileText = sandboxScript.upsertSandboxEnvironment(
        "BETTER_AUTH_URL=https://dev.tutribu.app\n",
        SANDBOX_CONNECTION_STRINGS
      );

      const cleanedFileText =
        sandboxScript.removeSandboxEnvironment(sandboxFileText);
      const assignments = readEnvironmentAssignments(cleanedFileText);

      expect([...assignments.keys()]).toEqual(["BETTER_AUTH_URL"]);
      expect(cleanedFileText).toBe("BETTER_AUTH_URL=https://dev.tutribu.app\n");
    });
  });

  describe("redactConnectionString", () => {
    it("should hide the password and query while keeping what identifies the target", () => {
      const redacted = sandboxScript.redactConnectionString(RUNTIME_URL);

      expect(redacted).not.toContain("runtime-secret");
      expect(redacted).not.toContain("sslmode");
      expect(redacted).toContain("neondb_owner");
      expect(redacted).toContain("ep-sandbox-pooler.example.neon.tech");
      expect(redacted).toContain("/neondb");
    });

    it("should never echo a value it cannot parse", () => {
      expect(sandboxScript.redactConnectionString("not a url secret")).not.toContain(
        "secret"
      );
    });
  });
});
