import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function readVersionedMigrationTags(): string[] {
  return readdirSync(path.join(process.cwd(), "database/migrations")).reduce<
    string[]
  >((migrationTags, migrationFileName) => {
    if (migrationFileName.endsWith(".sql")) {
      migrationTags.push(migrationFileName.replace(/\.sql$/, ""));
    }

    return migrationTags;
  }, []).sort();
}

const FORBIDDEN_INVITATION_TOKEN_CONTEXT_SETTING = [
  "current",
  "invitation",
  "token",
].join("_");
const FORBIDDEN_INVITATION_ID_CAST = ["id", "text"].join("::");

describe("Tribe SQL guardrails", () => {
  const neonBaselineMigrationPath =
    "database/migrations/20260426000000_create_neon_baseline.sql";
  const tribeInvitationsMigrationPath =
    "database/migrations/20260426070000_add_tribe_invitations.sql";
  const tribeTimestampDefaultsMigrationPath =
    "database/migrations/20260426080000_fix_tribe_timestamp_defaults.sql";
  const visibleTribeMembersMigrationPath =
    "database/migrations/20260506090000_add_visible_tribe_members_function.sql";
  const invitationAcceptanceRepairMigrationPath =
    "database/migrations/20260506110000_repair_invitation_acceptance_storage.sql";
  const removedSubscriptionMembershipStatusMigrationPath =
    "database/migrations/20260511120000_add_removed_subscription_membership_status.sql";
  const ownerReadAccessMigrationPath =
    "database/migrations/20260517120000_add_owner_read_access.sql";
  const prioritizedOwnerReadAccessMigrationPath =
    "database/migrations/20260518120000_prioritize_owner_read_access.sql";
  const drizzleMigrationJournalPath = "database/migrations/meta/_journal.json";

  it("enforces single-segment slugs in shared migrations", () => {
    const tribesMigration = readWorkspaceFile(
      neonBaselineMigrationPath
    );

    expect(tribesMigration).toContain(
      "CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')"
    );
  });

  it("does not ship a shared personal whitelist seed migration", () => {
    const personalSeedMigrationPath = path.join(
      process.cwd(),
      "database/migrations/20260326100000_seed_guido_modarelli_tribe_whitelist.sql"
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
      "FROM public.tribe_creator_whitelist"
    );
    expect(neonBaselineMigration).toContain("public.current_app_user_email()");
  });

  it("migrates tribe policies forward to Better Auth request context", () => {
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

  it("forces RLS on tribe tables for the shared database connection", () => {
    const neonBaselineMigration = readWorkspaceFile(neonBaselineMigrationPath);

    expect(neonBaselineMigration).toContain(
      "ALTER TABLE public.tribe_creator_whitelist FORCE ROW LEVEL SECURITY"
    );
    expect(neonBaselineMigration).toContain(
      "ALTER TABLE public.tribes FORCE ROW LEVEL SECURITY"
    );
    expect(neonBaselineMigration).toContain(
      "ALTER TABLE public.tribe_members FORCE ROW LEVEL SECURITY"
    );
  });

  it("drops the legacy tribe creation function during the Neon baseline", () => {
    const neonBaselineMigration = readWorkspaceFile(neonBaselineMigrationPath);

    expect(neonBaselineMigration).toContain(
      "DROP FUNCTION IF EXISTS public.create_private_tribe_with_leader_membership"
    );
  });

  it("keeps tribe creation timestamps database-generated", () => {
    const tribeTimestampDefaultsMigration = readWorkspaceFile(
      tribeTimestampDefaultsMigrationPath
    );

    expect(tribeTimestampDefaultsMigration).toContain(
      "ALTER TABLE public.tribes"
    );
    expect(tribeTimestampDefaultsMigration).toContain(
      "ALTER COLUMN created_at SET DEFAULT timezone('utc', now())"
    );
    expect(tribeTimestampDefaultsMigration).toContain(
      "ALTER TABLE public.tribe_members"
    );
    expect(tribeTimestampDefaultsMigration).toContain(
      "ALTER COLUMN created_at SET DEFAULT timezone('utc', now())"
    );
  });

  it("allows authenticated users to inspect invitation status by token and accept active invitations", () => {
    const tribeInvitationsMigration = readWorkspaceFile(
      tribeInvitationsMigrationPath
    );

    expect(tribeInvitationsMigration).toContain(
      "CREATE POLICY \"Authenticated users can accept active invitations\""
    );
    expect(tribeInvitationsMigration).toContain(
      "CREATE POLICY \"Authenticated users can read invitation by token\""
    );
    expect(tribeInvitationsMigration).toContain(
      "CREATE POLICY \"Authenticated users can read invited tribe by token\""
    );
    expect(tribeInvitationsMigration).toContain("role = 'tribemate'");
    expect(tribeInvitationsMigration).toContain(
      "tribe_invitations.status = 'active'"
    );
    expect(tribeInvitationsMigration).toContain(
      "status IN ('active', 'revoked')"
    );
    expect(tribeInvitationsMigration).toContain(
      "app.current_invitation_hash"
    );
    expect(tribeInvitationsMigration).not.toContain(
      FORBIDDEN_INVITATION_TOKEN_CONTEXT_SETTING
    );
    expect(tribeInvitationsMigration).not.toContain(
      FORBIDDEN_INVITATION_ID_CAST
    );
  });

  it("repairs invitation acceptance storage after skipped historical migrations", () => {
    const repairMigration = readWorkspaceFile(
      invitationAcceptanceRepairMigrationPath
    );

    expect(repairMigration).toContain(
      "CREATE TABLE IF NOT EXISTS public.tribe_invitations"
    );
    expect(repairMigration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS tribe_invitations_token_hash_key"
    );
    expect(repairMigration).toContain(
      "ADD COLUMN IF NOT EXISTS status_reason text NOT NULL DEFAULT 'none'"
    );
    expect(repairMigration).toContain(
      "CREATE POLICY \"Authenticated users can read invitation by token\""
    );
    expect(repairMigration).toContain(
      "CREATE POLICY \"Authenticated users can accept active invitations\""
    );
    expect(repairMigration).toContain("app.current_invitation_hash");
    expect(repairMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.can_manage_tribe_invitations(uuid)"
    );
  });

  it("lists visible tribe members through a definer function guarded by viewer membership", () => {
    const visibleTribeMembersMigration = readWorkspaceFile(
      visibleTribeMembersMigrationPath
    );

    expect(visibleTribeMembersMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.list_visible_tribe_members_by_slug"
    );
    expect(visibleTribeMembersMigration).toContain("SECURITY DEFINER");
    expect(visibleTribeMembersMigration).toContain(
      "viewer_membership.user_id = public.current_app_user_id()"
    );
    expect(visibleTribeMembersMigration).toContain(
      "viewer_membership.status IN ('active', 'muted')"
    );
    expect(visibleTribeMembersMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_visible_tribe_members_by_slug(text)"
    );
  });

  it("removes inactive subscription memberships from tribe row read access", () => {
    const removedSubscriptionMembershipStatusMigration = readWorkspaceFile(
      removedSubscriptionMembershipStatusMigrationPath
    );

    expect(removedSubscriptionMembershipStatusMigration).toContain(
      "DROP POLICY IF EXISTS \"Tribemates can read own tribes\""
    );
    expect(removedSubscriptionMembershipStatusMigration).toContain(
      "CREATE POLICY \"Tribemates can read own tribes\""
    );
    expect(removedSubscriptionMembershipStatusMigration).toContain(
      "tribe_members.status IN ('active', 'muted')"
    );
    expect(removedSubscriptionMembershipStatusMigration).not.toContain(
      "tribe_members.status <> 'blocked'"
    );
  });

  it("allows the configured owner to read tribes without membership", () => {
    const ownerReadAccessMigration = readWorkspaceFile(ownerReadAccessMigrationPath);

    expect(ownerReadAccessMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.current_app_owner_email()"
    );
    expect(ownerReadAccessMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.is_app_owner()"
    );
    expect(ownerReadAccessMigration).toContain(
      "public.is_app_owner()"
    );
    expect(ownerReadAccessMigration).toContain(
      "CREATE POLICY \"Tribemates and owner can read tribes\""
    );
    expect(ownerReadAccessMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.can_read_tribe_content"
    );
    expect(ownerReadAccessMigration).toContain("'owner_read'");
    expect(ownerReadAccessMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.list_visible_tribe_members_by_slug"
    );
  });

  it("keeps owner read access out of tribe write and management helpers", () => {
    const ownerReadAccessMigration = readWorkspaceFile(ownerReadAccessMigrationPath);
    const activeMembershipFunctionStart = ownerReadAccessMigration.indexOf(
      "CREATE OR REPLACE FUNCTION public.is_active_tribe_member"
    );
    const manageChannelFunctionStart = ownerReadAccessMigration.indexOf(
      "CREATE OR REPLACE FUNCTION public.can_manage_tribe_channels"
    );
    const manageEventFunctionStart = ownerReadAccessMigration.indexOf(
      "CREATE OR REPLACE FUNCTION public.can_manage_tribe_events"
    );

    expect(activeMembershipFunctionStart).toBe(-1);
    expect(manageChannelFunctionStart).toBe(-1);
    expect(manageEventFunctionStart).toBe(-1);
  });

  it("prioritizes owner read access over existing blocked memberships", () => {
    const prioritizedOwnerReadAccessMigration = readWorkspaceFile(
      prioritizedOwnerReadAccessMigrationPath
    );
    const ownerReadSelectionIndex = prioritizedOwnerReadAccessMigration.indexOf(
      "SELECT 'owner_read', 'none'"
    );
    const currentMembershipSelectionIndex =
      prioritizedOwnerReadAccessMigration.indexOf(
        "SELECT current_membership.status, current_membership.status_reason"
      );

    expect(prioritizedOwnerReadAccessMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_current_tribe_membership_by_slug"
    );
    expect(ownerReadSelectionIndex).toBeGreaterThanOrEqual(0);
    expect(currentMembershipSelectionIndex).toBeGreaterThanOrEqual(0);
    expect(ownerReadSelectionIndex).toBeLessThan(currentMembershipSelectionIndex);
    expect(prioritizedOwnerReadAccessMigration).toContain(
      "WHERE NOT public.is_app_owner()"
    );
  });

  it("registers the visible tribe members function migration in the Drizzle journal", () => {
    const drizzleMigrationJournal = readWorkspaceFile(
      drizzleMigrationJournalPath
    );

    expect(drizzleMigrationJournal).toContain(
      "20260506090000_add_visible_tribe_members_function"
    );
  });

  it("registers the owner read access migration in the Drizzle journal", () => {
    const drizzleMigrationJournal = readWorkspaceFile(
      drizzleMigrationJournalPath
    );

    expect(drizzleMigrationJournal).toContain(
      "20260517120000_add_owner_read_access"
    );
  });

  it("registers the prioritized owner read access migration in the Drizzle journal", () => {
    const drizzleMigrationJournal = readWorkspaceFile(
      drizzleMigrationJournalPath
    );

    expect(drizzleMigrationJournal).toContain(
      "20260518120000_prioritize_owner_read_access"
    );
  });

  it("registers every versioned SQL migration in the Drizzle journal", () => {
    const journal = JSON.parse(
      readWorkspaceFile(drizzleMigrationJournalPath)
    ) as {
      entries: Array<{ tag: string }>;
    };
    const registeredMigrationTags = journal.entries
      .map((journalEntry) => journalEntry.tag)
      .sort();

    expect(registeredMigrationTags).toEqual(readVersionedMigrationTags());
  });

  it("runs the invitation acceptance repair before subscription migrations", () => {
    const journal = JSON.parse(
      readWorkspaceFile(drizzleMigrationJournalPath)
    ) as {
      entries: Array<{ idx: number; tag: string; when: number }>;
    };
    const repairMigrationEntry = journal.entries.find(
      (journalEntry) =>
        journalEntry.tag === "20260506110000_repair_invitation_acceptance_storage"
    );
    const subscriptionMigrationEntry = journal.entries.find(
      (journalEntry) =>
        journalEntry.tag === "20260506130000_create_tribe_subscriptions"
    );

    expect(repairMigrationEntry).toBeDefined();
    expect(subscriptionMigrationEntry).toBeDefined();
    expect(repairMigrationEntry?.idx).toBeLessThan(
      subscriptionMigrationEntry?.idx ?? Number.POSITIVE_INFINITY
    );
    expect(repairMigrationEntry?.when).toBeLessThan(
      subscriptionMigrationEntry?.when ?? Number.POSITIVE_INFINITY
    );
  });
});
