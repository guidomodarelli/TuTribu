import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Community SQL guardrails", () => {
  it("enforces single-segment slugs in shared migrations", () => {
    const communitiesMigration = readWorkspaceFile(
      "supabase/migrations/20260326091000_create_communities_and_memberships.sql"
    );

    expect(communitiesMigration).toContain(
      "CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')"
    );
  });

  it("does not ship a shared personal whitelist seed migration", () => {
    const personalSeedMigrationPath = path.join(
      process.cwd(),
      "supabase/migrations/20260326100000_seed_guido_modarelli_community_whitelist.sql"
    );

    expect(existsSync(personalSeedMigrationPath)).toBe(false);
  });

  it("keeps the original auth-backed create migrations immutable", () => {
    const whitelistMigration = readWorkspaceFile(
      "supabase/migrations/20260326090000_create_community_creator_whitelist.sql"
    );
    const communitiesMigration = readWorkspaceFile(
      "supabase/migrations/20260326091000_create_communities_and_memberships.sql"
    );

    expect(whitelistMigration).toContain("created_by uuid REFERENCES auth.users(id)");
    expect(whitelistMigration).toContain("TO authenticated");
    expect(communitiesMigration).toContain(
      "created_by uuid NOT NULL REFERENCES auth.users(id)"
    );
    expect(communitiesMigration).toContain("user_id uuid NOT NULL REFERENCES auth.users(id)");
    expect(communitiesMigration).toContain("auth.uid()");
    expect(communitiesMigration).toContain("auth.jwt()");
  });

  it("only exposes slug availability checks to whitelisted creators after the Better Auth upgrade", () => {
    const betterAuthUpgradeMigration = readWorkspaceFile(
      "supabase/migrations/20260326107000_migrate_community_auth_schema_to_better_auth.sql"
    );

    expect(betterAuthUpgradeMigration).toContain(
      "FROM public.community_creator_whitelist"
    );
    expect(betterAuthUpgradeMigration).toContain("public.current_app_user_email()");
  });

  it("migrates community policies forward to Better Auth request context", () => {
    const betterAuthUpgradeMigration = readWorkspaceFile(
      "supabase/migrations/20260326107000_migrate_community_auth_schema_to_better_auth.sql"
    );

    expect(betterAuthUpgradeMigration).not.toContain("auth.uid()");
    expect(betterAuthUpgradeMigration).not.toContain("auth.jwt()");
    expect(betterAuthUpgradeMigration).toContain(
      "current_setting('app.current_user_id', true)"
    );
    expect(betterAuthUpgradeMigration).toContain(
      "ALTER COLUMN created_by TYPE text USING created_by::text"
    );
    expect(betterAuthUpgradeMigration).toContain(
      "ALTER COLUMN user_id TYPE text USING user_id::text"
    );
    expect(betterAuthUpgradeMigration).toContain(
      'REFERENCES public."user"(id)'
    );
  });

  it("forces RLS on community tables for the shared database connection", () => {
    const betterAuthUpgradeMigration = readWorkspaceFile(
      "supabase/migrations/20260326107000_migrate_community_auth_schema_to_better_auth.sql"
    );

    expect(betterAuthUpgradeMigration).toContain(
      "ALTER TABLE public.community_creator_whitelist FORCE ROW LEVEL SECURITY"
    );
    expect(betterAuthUpgradeMigration).toContain(
      "ALTER TABLE public.communities FORCE ROW LEVEL SECURITY"
    );
    expect(betterAuthUpgradeMigration).toContain(
      "ALTER TABLE public.community_members FORCE ROW LEVEL SECURITY"
    );
  });

  it("drops the legacy community creation function after switching to direct SQL repositories", () => {
    const betterAuthUpgradeMigration = readWorkspaceFile(
      "supabase/migrations/20260326107000_migrate_community_auth_schema_to_better_auth.sql"
    );

    expect(betterAuthUpgradeMigration).toContain(
      "DROP FUNCTION IF EXISTS public.create_private_community_with_owner_membership"
    );
  });
});
