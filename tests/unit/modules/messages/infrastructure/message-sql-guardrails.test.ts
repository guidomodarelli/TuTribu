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
});
