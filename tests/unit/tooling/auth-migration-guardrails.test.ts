/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Auth migration guardrails", () => {
  it("does not depend on Supabase auth runtime packages in package.json", () => {
    const packageJson = JSON.parse(readWorkspaceFile("package.json")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).not.toHaveProperty("@supabase/ssr");
    expect(packageJson.dependencies).not.toHaveProperty("@supabase/supabase-js");
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
      "supabase/migrations/20260326085000_create_better_auth_tables.sql"
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
});
