import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Community SQL guardrails", () => {
  const neonBaselineMigrationPath =
    "database/migrations/20260426000000_create_neon_baseline.sql";

  it("enforces single-segment slugs in shared migrations", () => {
    const communitiesMigration = readWorkspaceFile(
      neonBaselineMigrationPath
    );

    expect(communitiesMigration).toContain(
      "CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')"
    );
  });

  it("does not ship a shared personal whitelist seed migration", () => {
    const personalSeedMigrationPath = path.join(
      process.cwd(),
      "database/migrations/20260326100000_seed_guido_modarelli_community_whitelist.sql"
    );

    expect(existsSync(personalSeedMigrationPath)).toBe(false);
  });

  it("uses Better Auth tables instead of Supabase Auth references in active migrations", () => {
    const neonBaselineMigration = readWorkspaceFile(neonBaselineMigrationPath);

    expect(neonBaselineMigration).not.toContain("auth.users");
    expect(neonBaselineMigration).not.toContain("auth.uid()");
    expect(neonBaselineMigration).not.toContain("auth.jwt()");
    expect(neonBaselineMigration).toContain('REFERENCES public."user"(id)');
  });

  it("only exposes slug availability checks to whitelisted creators after the Better Auth upgrade", () => {
    const neonBaselineMigration = readWorkspaceFile(neonBaselineMigrationPath);

    expect(neonBaselineMigration).toContain(
      "FROM public.community_creator_whitelist"
    );
    expect(neonBaselineMigration).toContain("public.current_app_user_email()");
  });

  it("migrates community policies forward to Better Auth request context", () => {
    const neonBaselineMigration = readWorkspaceFile(neonBaselineMigrationPath);

    expect(neonBaselineMigration).not.toContain("auth.uid()");
    expect(neonBaselineMigration).not.toContain("auth.jwt()");
    expect(neonBaselineMigration).toContain(
      "current_setting('app.current_user_id', true)"
    );
    expect(neonBaselineMigration).toContain(
      "current_setting('app.current_user_email', true)"
    );
    expect(neonBaselineMigration).toContain(
      'REFERENCES public."user"(id)'
    );
  });

  it("forces RLS on community tables for the shared database connection", () => {
    const neonBaselineMigration = readWorkspaceFile(neonBaselineMigrationPath);

    expect(neonBaselineMigration).toContain(
      "ALTER TABLE public.community_creator_whitelist FORCE ROW LEVEL SECURITY"
    );
    expect(neonBaselineMigration).toContain(
      "ALTER TABLE public.communities FORCE ROW LEVEL SECURITY"
    );
    expect(neonBaselineMigration).toContain(
      "ALTER TABLE public.community_members FORCE ROW LEVEL SECURITY"
    );
  });

  it("drops the legacy community creation function during the Neon baseline", () => {
    const neonBaselineMigration = readWorkspaceFile(neonBaselineMigrationPath);

    expect(neonBaselineMigration).toContain(
      "DROP FUNCTION IF EXISTS public.create_private_community_with_owner_membership"
    );
  });
});
