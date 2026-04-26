/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";

const NEON_BASELINE_MIGRATION_TAG = "20260426000000_create_neon_baseline";
const NEON_BASELINE_SNAPSHOT_PATH = "database/migrations/meta/0000_snapshot.json";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

async function loadDrizzleConfigWithEnvironment(environment: {
  databaseUrl?: string;
  databaseMigrationUrl?: string;
}) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousDatabaseMigrationUrl = process.env.DATABASE_MIGRATION_URL;

  jest.resetModules();

  if (environment.databaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = environment.databaseUrl;
  }

  if (environment.databaseMigrationUrl === undefined) {
    delete process.env.DATABASE_MIGRATION_URL;
  } else {
    process.env.DATABASE_MIGRATION_URL = environment.databaseMigrationUrl;
  }

  try {
    return (await import("../../../drizzle.config")).default;
  } finally {
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
  }
}

describe("Auth migration guardrails", () => {
  it("does not depend on Supabase runtime or tooling packages in package.json", () => {
    const packageJson = JSON.parse(readWorkspaceFile("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).not.toHaveProperty("@supabase/ssr");
    expect(packageJson.dependencies).not.toHaveProperty("@supabase/supabase-js");
    expect(packageJson.devDependencies).not.toHaveProperty("supabase");
  });

  it("does not reference Supabase auth helpers in production auth code", () => {
    const authSetup = readWorkspaceFile("src/modules/setup.ts");
    const routeSignIn = readWorkspaceFile("app/auth/signin/page.tsx");
    const routes = readWorkspaceFile("src/constants/routes.ts");

    expect(authSetup).not.toContain("createServerSupabaseClient");
    expect(routeSignIn).not.toContain("navigateToGoogleAuthStart");
    expect(routes).not.toContain("googleStart");
    expect(routes).not.toContain("callback");
    expect(routes).not.toContain("signOut");
  });

  it("quotes Better Auth camelCase columns in the bootstrap migration", () => {
    const betterAuthBootstrapMigration = readWorkspaceFile(
      "database/migrations/20260426000000_create_neon_baseline.sql"
    );

    expect(betterAuthBootstrapMigration).toContain('"emailVerified" boolean');
    expect(betterAuthBootstrapMigration).toContain('"createdAt" timestamptz');
    expect(betterAuthBootstrapMigration).toContain('"updatedAt" timestamptz');
    expect(betterAuthBootstrapMigration).toContain('"expiresAt" timestamptz');
    expect(betterAuthBootstrapMigration).toContain('"ipAddress" text');
    expect(betterAuthBootstrapMigration).toContain('"userAgent" text');
    expect(betterAuthBootstrapMigration).toContain('"userId" text NOT NULL');
    expect(betterAuthBootstrapMigration).toContain('"accountId" text NOT NULL');
    expect(betterAuthBootstrapMigration).toContain('"providerId" text NOT NULL');
    expect(betterAuthBootstrapMigration).toContain('"accessToken" text');
    expect(betterAuthBootstrapMigration).toContain('"refreshToken" text');
    expect(betterAuthBootstrapMigration).toContain('"idToken" text');
    expect(betterAuthBootstrapMigration).toContain('"accessTokenExpiresAt" timestamptz');
    expect(betterAuthBootstrapMigration).toContain('"refreshTokenExpiresAt" timestamptz');
  });

  it("documents Neon database environment without legacy Supabase variables", () => {
    const environmentExample = readWorkspaceFile(".env.example");
    const readme = readWorkspaceFile("README.md");

    expect(environmentExample).toContain("DATABASE_URL=");
    expect(environmentExample).toContain("DATABASE_MIGRATION_URL=");
    expect(environmentExample).toContain("ACADEMIA_BACKEND_BASE_URL=");
    expect(environmentExample).toContain("CONTACT_EMAIL=");
    expect(readme).toContain("ACADEMIA_BACKEND_BASE_URL");
    expect(readme).toContain("CONTACT_EMAIL");
    expect(readme).toContain("Neon Postgres");
    expect(environmentExample).not.toContain("SUPABASE_URL");
    expect(environmentExample).not.toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(readme).not.toContain("SUPABASE_URL");
    expect(readme).not.toContain("SUPABASE_PUBLISHABLE_KEY");
  });

  it("generates future Drizzle migrations in the provider-neutral database folder", () => {
    const drizzleConfig = readWorkspaceFile("drizzle.config.ts");

    expect(drizzleConfig).toContain('out: "./database/migrations"');
    expect(drizzleConfig).toContain('const DATABASE_MIGRATION_URL_ENV = "DATABASE_MIGRATION_URL"');
  });

  it("registers the Neon baseline migration in the Drizzle journal", () => {
    const journal = JSON.parse(
      readWorkspaceFile("database/migrations/meta/_journal.json")
    ) as {
      entries: Array<{ tag: string }>;
    };

    expect(journal.entries).toContainEqual(
      expect.objectContaining({ tag: NEON_BASELINE_MIGRATION_TAG })
    );
    expect(
      readWorkspaceFile(`database/migrations/${NEON_BASELINE_MIGRATION_TAG}.sql`)
    ).toContain('CREATE TABLE IF NOT EXISTS public."user"');
  });

  it("keeps the Drizzle snapshot for future migration generation", () => {
    const snapshot = JSON.parse(readWorkspaceFile(NEON_BASELINE_SNAPSHOT_PATH)) as {
      dialect: string;
      tables: Record<string, unknown>;
    };

    expect(snapshot.dialect).toBe("postgresql");
    expect(Object.hasOwn(snapshot.tables, "public.user")).toBe(true);
    expect(Object.hasOwn(snapshot.tables, "public.communities")).toBe(true);
  });

  it("falls back to DATABASE_URL when DATABASE_MIGRATION_URL is empty", async () => {
    const databaseUrl = "postgresql://runtime-user:password@example.test/runtime";

    await expect(
      loadDrizzleConfigWithEnvironment({
        databaseMigrationUrl: "",
        databaseUrl,
      })
    ).resolves.toMatchObject({
      dbCredentials: {
        url: databaseUrl,
      },
    });
  });
});
