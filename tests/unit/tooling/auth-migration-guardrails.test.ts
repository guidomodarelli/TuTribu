/** @jest-environment node */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PG_CLOUDFLARE_TRACE_FILES,
  cloudflareOutputFileTracingIncludes,
  getCloudflareOutputFileTracingIncludes,
} from "@/config/cloudflare-output-tracing";
import { shouldInitializeOpenNextCloudflareForDev } from "@/config/cloudflare-dev-runtime";

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

async function loadDrizzleConfigFromTemporaryEnvironmentFile(
  environmentFileName: ".env" | ".env.local",
  environmentFileContent: string
) {
  const previousNodeEnvironment = process.env.NODE_ENV;
  const previousWorkingDirectory = process.cwd();
  const temporaryWorkspace = mkdtempSync(path.join(os.tmpdir(), "tutribu-env-"));

  writeFileSync(
    path.join(temporaryWorkspace, environmentFileName),
    environmentFileContent,
    "utf8"
  );

  process.chdir(temporaryWorkspace);
  process.env.NODE_ENV = "development";

  try {
    return await loadDrizzleConfigWithEnvironment({});
  } finally {
    if (previousNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnvironment;
    }

    process.chdir(previousWorkingDirectory);
    rmSync(temporaryWorkspace, { force: true, recursive: true });
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

  it("declares the Cloudflare socket adapter required by pg as a runtime dependency", () => {
    const packageJson = JSON.parse(readWorkspaceFile("package.json")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toHaveProperty("pg-cloudflare");
  });

  it("includes pg-cloudflare runtime files in Cloudflare output tracing", () => {
    expect(Object.values(cloudflareOutputFileTracingIncludes).flat()).toEqual(
      expect.arrayContaining([...PG_CLOUDFLARE_TRACE_FILES])
    );
  });

  it("skips Cloudflare output tracing on Vercel builds", () => {
    expect(getCloudflareOutputFileTracingIncludes({ VERCEL: "1" })).toBeUndefined();
    expect(getCloudflareOutputFileTracingIncludes({})).toBe(
      cloudflareOutputFileTracingIncludes
    );
  });

  it("skips OpenNext Cloudflare dev initialization on Vercel builds", () => {
    expect(shouldInitializeOpenNextCloudflareForDev({ VERCEL: "1" })).toBe(false);
    expect(shouldInitializeOpenNextCloudflareForDev({})).toBe(true);
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
    expect(environmentExample).toContain("TUTRIBU_BACKEND_BASE_URL=");
    expect(environmentExample).toContain("CONTACT_EMAIL=");
    expect(readme).toContain("TUTRIBU_BACKEND_BASE_URL");
    expect(readme).toContain("CONTACT_EMAIL");
    expect(readme).toContain("Neon Postgres");
    expect(readme).toContain("direct Neon URL for warm runtime environments");
    expect(readme).toContain("disable Scale to Zero");
    expect(readme).not.toContain("Use the pooled Neon URL for deployed runtime environments");
    expect(readme).not.toContain("host-pooler.region.aws.neon.tech");
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
    expect(Object.hasOwn(snapshot.tables, "public.tribes")).toBe(true);
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

  it("loads migration credentials from .env.local when shell variables are missing", async () => {
    const databaseMigrationUrl =
      "postgresql://migration-user:password@example.test/migration";

    await expect(
      loadDrizzleConfigFromTemporaryEnvironmentFile(
        ".env.local",
        `DATABASE_MIGRATION_URL=${databaseMigrationUrl}`
      )
    ).resolves.toMatchObject({
      dbCredentials: {
        url: databaseMigrationUrl,
      },
    });
  });
});
