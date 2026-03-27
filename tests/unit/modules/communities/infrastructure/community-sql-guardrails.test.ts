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
    const atomicCreationMigration = readWorkspaceFile(
      "supabase/migrations/20260326104000_create_atomic_community_creation_function.sql"
    );

    expect(communitiesMigration).toContain(
      "CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')"
    );
    expect(atomicCreationMigration).toContain(
      "target_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'"
    );
  });

  it("does not ship a shared personal whitelist seed migration", () => {
    const personalSeedMigrationPath = path.join(
      process.cwd(),
      "supabase/migrations/20260326100000_seed_guido_modarelli_community_whitelist.sql"
    );

    expect(existsSync(personalSeedMigrationPath)).toBe(false);
  });

  it("only exposes slug availability checks to whitelisted creators", () => {
    const slugDiagnosticMigration = readWorkspaceFile(
      "supabase/migrations/20260326105000_add_community_slug_taken_diagnostic.sql"
    );

    expect(slugDiagnosticMigration).toContain(
      "FROM public.community_creator_whitelist"
    );
    expect(slugDiagnosticMigration).toContain(
      "community_creator_whitelist.email = lower(coalesce(auth.jwt() ->> 'email', ''))"
    );
  });
});
