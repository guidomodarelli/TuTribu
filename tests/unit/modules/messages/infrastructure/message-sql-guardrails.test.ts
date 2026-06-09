import { readFileSync } from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function readPolicyBlock(migration: string, policyName: string): string {
  const policyStart = migration.indexOf(`CREATE POLICY "${policyName}"`);
  const policyEnd = migration.indexOf(";", policyStart);

  if (policyStart === -1 || policyEnd === -1) {
    throw new Error(`Policy ${policyName} was not found in migration`);
  }

  return migration.slice(policyStart, policyEnd + 1);
}

describe("Message SQL guardrails", () => {
  const messagesMigrationPath =
    "database/migrations/20260426010000_create_tribe_messages_round.sql";

  it("creates tenant-scoped message tables with a single like per user and message", () => {
    const migration = readWorkspaceFile(messagesMigrationPath);

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.messages");
    expect(migration).toContain("tribe_id uuid NOT NULL REFERENCES public.tribes(id)");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.message_replies");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.message_reactions");
    expect(migration).toContain("UNIQUE (message_id, user_id)");
    expect(migration).toContain("CHECK (type IN ('like'))");
  });

  it("adds a nullable message title for existing round data", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260426020000_add_message_titles.sql"
    );

    expect(migration).toContain("ALTER TABLE public.messages");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS title text");
  });

  it("adds mandatory tribe channels and preserves existing messages", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260426040000_add_tribe_channels.sql"
    );

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.tribe_channels");
    expect(migration).toContain("UNIQUE (tribe_id, slug)");
    expect(migration).toContain("('Ronda', 'ronda', '🔥', 20)");
    expect(migration).not.toContain("('Anuncios', 'anuncios'");
    expect(migration).not.toContain("('Preguntas', 'preguntas'");
    expect(migration).not.toContain("('Eventos', 'eventos'");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS channel_id uuid");
    expect(migration).toContain("WITH tribe_ronda_channels AS");
    expect(migration).toContain("UPDATE public.messages");
    expect(migration).toContain("SET");
    expect(migration).toContain("channel_id = tribe_ronda_channels.id");
    expect(migration).toContain("messages.tribe_id = tribe_ronda_channels.tribe_id");
    expect(migration).toContain("ALTER COLUMN channel_id SET NOT NULL");
    expect(migration).toContain("REFERENCES public.tribe_channels(id)");
    expect(migration).not.toContain("DELETE FROM public.messages");
  });

  it("moves obsolete initial channel messages into Ronda before deleting those channels", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260426050000_keep_only_ronda_initial_channel.sql"
    );

    expect(migration).toContain("WITH ronda_channels AS");
    expect(migration).toContain("UPDATE public.messages");
    expect(migration).toContain("channel_id = ronda_channels.id");
    expect(migration).toContain("source_channels.slug IN ('anuncios', 'preguntas', 'eventos')");
    expect(migration).toContain("DELETE FROM public.tribe_channels obsolete_channels");
    expect(migration).toContain("obsolete_channels.slug IN ('anuncios', 'preguntas', 'eventos')");
  });

  it("limits channel management to leaders and guardians", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260426040000_add_tribe_channels.sql"
    );
    const incrementalMigration = readWorkspaceFile(
      "database/migrations/20260426060000_limit_channel_management_to_leaders_and_guardians.sql"
    );

    expect(migration).toContain("public.can_manage_tribe_channels");
    expect(migration).toContain("tribe_members.role IN ('leader', 'guardian')");
    expect(migration).toContain("ALTER TABLE public.tribe_channels FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("Leaders and guardians can manage tribe channels");
    expect(incrementalMigration).toContain("CREATE OR REPLACE FUNCTION public.can_manage_tribe_channels");
    expect(incrementalMigration).toContain("tribe_members.role IN ('leader', 'guardian')");
    expect(incrementalMigration).toContain("Leaders and guardians can manage tribe channels");
    expect(incrementalMigration).toContain("Leaders and guardians can move messages between channels");
    expect(incrementalMigration).toContain("ON public.messages");
    expect(incrementalMigration).toContain("FOR UPDATE");
  });

  it("forces RLS and limits write participation to active members", () => {
    const migration = readWorkspaceFile(messagesMigrationPath);

    expect(migration).toContain("ALTER TABLE public.messages FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.message_replies FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.message_reactions FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("public.is_active_tribe_member(tribe_id)");
    expect(migration).toContain("public.can_read_tribe_content(tribe_id)");
  });

  it("adds message pins with RLS restricted to active leaders and guardians", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260512140000_create_message_pins.sql"
    );
    const migrationJournal = JSON.parse(
      readWorkspaceFile("database/migrations/meta/_journal.json")
    ) as { entries: Array<{ tag: string }> };

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.message_pins");
    expect(migration).toContain("message_id uuid PRIMARY KEY");
    expect(migration).toContain("pinned_by text NOT NULL REFERENCES public.\"user\"(id)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.can_pin_tribe_messages");
    expect(migration).toContain("tribe_members.role IN ('leader', 'guardian')");
    expect(migration).toContain("tribe_members.status = 'active'");
    expect(migration).toContain("ALTER TABLE public.message_pins FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("Tribemates can read message pins");
    expect(migration).toContain("Leaders and guardians can manage message pins");
    expect(migrationJournal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "20260512140000_create_message_pins",
        }),
      ])
    );
  });

  it("restricts message poll management to authors, leaders, and guardians", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260513120000_create_message_polls.sql"
    );
    const pollPolicy = readPolicyBlock(
      migration,
      "Authors leaders and guardians can manage message polls"
    );
    const optionPolicy = readPolicyBlock(
      migration,
      "Authors leaders and guardians can manage message poll options"
    );

    expect(pollPolicy).toMatch(/public\.can_pin_tribe_messages\(tribe_id\)/);
    expect(pollPolicy).toMatch(/messages\.author_id = public\.current_app_user_id\(\)/);
    expect(pollPolicy).not.toMatch(/public\.is_active_tribe_member\(tribe_id\)/);
    expect(optionPolicy).toMatch(/public\.can_pin_tribe_messages\(tribe_id\)/);
    expect(optionPolicy).toMatch(/messages\.author_id = public\.current_app_user_id\(\)/);
    expect(optionPolicy).not.toMatch(/public\.is_active_tribe_member\(tribe_id\)/);
  });

  it("allows deleting complete messages through author or staff RLS and keeps polls open", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260513130000_delete_messages_with_poll_blocks.sql"
    );
    const migrationJournal = JSON.parse(
      readWorkspaceFile("database/migrations/meta/_journal.json")
    ) as { entries: Array<{ tag: string }> };
    const deletePolicy = readPolicyBlock(
      migration,
      "Authors leaders and guardians can delete tribe messages"
    );

    expect(migration).toContain("UPDATE public.message_polls");
    expect(migration).toContain("WHERE status = 'closed'");
    expect(deletePolicy).toContain("FOR DELETE");
    expect(deletePolicy).toMatch(/author_id = public\.current_app_user_id\(\)/);
    expect(deletePolicy).toMatch(/public\.is_active_tribe_member\(tribe_id\)/);
    expect(deletePolicy).toMatch(/public\.can_pin_tribe_messages\(tribe_id\)/);
    expect(migrationJournal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "20260513130000_delete_messages_with_poll_blocks",
        }),
      ])
    );
  });

  it("locks the orphan-image cleanup definer functions to maintenance callers only", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260609120000_create_orphan_image_cleanup.sql"
    );
    const migrationJournal = JSON.parse(
      readWorkspaceFile("database/migrations/meta/_journal.json")
    ) as { entries: Array<{ tag: string }> };
    const maintenanceGuard =
      "nullif(current_setting('app.current_user_id', true), '') IS NULL";
    const definerFunctions = [
      "enqueue_tribe_message_images_for_remote_deletion",
      "enqueue_user_message_images_for_remote_deletion",
      "reclaim_abandoned_draft_message_images",
      "list_message_images_pending_remote_deletion",
      "confirm_message_image_remote_deleted",
      "list_queued_remote_image_deletions",
      "delete_queued_remote_image_deletion",
    ];

    // PostgreSQL grants EXECUTE to PUBLIC by default, which would expose every
    // SECURITY DEFINER primitive to any request-scoped role. Each function must
    // revoke that default so only the function owner (the cron sweep) keeps it.
    for (const functionName of definerFunctions) {
      expect(migration).toMatch(
        new RegExp(
          `REVOKE EXECUTE ON FUNCTION public\\.${functionName}\\([^)]*\\)\\s*FROM PUBLIC;`
        )
      );
    }

    // The remote-deletion confirmation must never flip an attached or draft image
    // to deleted; it only finalizes rows already slated for deletion.
    expect(migration).toContain("AND status = 'pending_delete'");

    // The persistent callable entrypoints self-authorize as maintenance work by
    // acting only when no app user context is present. The single-argument listing
    // function is dropped and replaced in 20260609130000, so its guard lives there.
    const guardedEntrypoints = [
      "reclaim_abandoned_draft_message_images",
      "confirm_message_image_remote_deleted",
      "list_queued_remote_image_deletions",
      "delete_queued_remote_image_deletion",
    ];
    for (const functionName of guardedEntrypoints) {
      const functionStart = migration.indexOf(
        `CREATE FUNCTION public.${functionName}(`
      );
      const functionEnd = migration.indexOf("$$;", functionStart);
      expect(functionStart).toBeGreaterThan(-1);
      expect(migration.slice(functionStart, functionEnd)).toContain(
        maintenanceGuard
      );
    }

    // Owner-only: these definer maintenance primitives must never be granted to a
    // shared request/Data API role. A role such as `authenticated` would reach the
    // RLS bypass directly, because it never sets `app.current_user_id` and so
    // satisfies the maintenance guard. The cron sweep runs as the function owner,
    // which keeps EXECUTE after the PUBLIC revoke, so no request-role grant exists.
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.[a-z_]+\([^)]*\) TO authenticated/
    );

    expect(migrationJournal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "20260609120000_create_orphan_image_cleanup",
        }),
      ])
    );
  });

  it("re-locks the grace-window listing function after the drop and recreate", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260609130000_guard_pending_image_cleanup_window.sql"
    );
    const migrationJournal = JSON.parse(
      readWorkspaceFile("database/migrations/meta/_journal.json")
    ) as { entries: Array<{ tag: string }> };

    // DROP + CREATE resets the function's privileges to the PUBLIC default, so the
    // recreated grace-window form must revoke PUBLIC and re-apply the guard.
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.list_message_images_pending_remote_deletion\(integer, interval\)\s*FROM PUBLIC;/
    );
    expect(migration).toContain(
      "nullif(current_setting('app.current_user_id', true), '') IS NULL"
    );
    // Owner-only after the recreate: the grace-window listing function must not be
    // re-granted to a shared request/Data API role such as `authenticated`.
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.list_message_images_pending_remote_deletion\(integer, interval\) TO authenticated/
    );
    expect(migrationJournal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "20260609130000_guard_pending_image_cleanup_window",
        }),
      ])
    );
  });

  it("lets the table owner cross the remote-deletion queue without relying on BYPASSRLS", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260609140000_allow_owner_maintenance_queue_rls.sql"
    );
    const migrationJournal = JSON.parse(
      readWorkspaceFile("database/migrations/meta/_journal.json")
    ) as { entries: Array<{ tag: string }> };

    // The queue stays locked under FORCE ROW LEVEL SECURITY; this migration must
    // not weaken that by disabling or un-forcing RLS to make the owner fit.
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(migration).not.toMatch(/NO FORCE ROW LEVEL SECURITY/i);

    // Each crossing the SECURITY DEFINER maintenance functions need (enqueue =
    // INSERT, list = SELECT, dequeue = DELETE) gets a policy scoped to the table
    // owner via pg_class.relowner, so a non-bypass owner is authorized while every
    // other principal stays denied. Matching relowner dynamically keeps it correct
    // whatever role owns the table in a given deployment.
    const ownerExceptionTargets: Array<{ policyName: string; clause: string }> = [
      {
        policyName: "Owner maintenance can enqueue remote image deletions",
        clause: "WITH CHECK",
      },
      {
        policyName: "Owner maintenance can read remote image deletions",
        clause: "USING",
      },
      {
        policyName: "Owner maintenance can delete remote image deletions",
        clause: "USING",
      },
    ];

    for (const { policyName, clause } of ownerExceptionTargets) {
      const policyBlock = readPolicyBlock(migration, policyName);
      expect(policyBlock).toContain(clause);
      expect(policyBlock).toContain("current_user =");
      expect(policyBlock).toContain("pg_get_userbyid(pg_class.relowner)");
      expect(policyBlock).toContain(
        "'public.pending_remote_image_deletions'::regclass"
      );
    }

    expect(migrationJournal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "20260609140000_allow_owner_maintenance_queue_rls",
        }),
      ])
    );
  });
});
