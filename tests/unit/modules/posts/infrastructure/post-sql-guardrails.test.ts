import { readFileSync } from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Post SQL guardrails", () => {
  const postsMigrationPath =
    "database/migrations/20260426010000_create_tribe_posts_feed.sql";

  it("creates tenant-scoped post tables with a single like per user and post", () => {
    const migration = readWorkspaceFile(postsMigrationPath);

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.posts");
    expect(migration).toContain("tribe_id uuid NOT NULL REFERENCES public.tribes(id)");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.post_comments");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.post_reactions");
    expect(migration).toContain("UNIQUE (post_id, user_id)");
    expect(migration).toContain("CHECK (type IN ('like'))");
  });

  it("adds a nullable post title for existing feed data", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260426020000_add_post_titles.sql"
    );

    expect(migration).toContain("ALTER TABLE public.posts");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS title text");
  });

  it("adds mandatory tribe channels and preserves existing posts", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260426040000_add_tribe_channels.sql"
    );

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.tribe_channels");
    expect(migration).toContain("UNIQUE (tribe_id, slug)");
    expect(migration).toContain("('General', 'general', '💬', 20)");
    expect(migration).not.toContain("('Anuncios', 'anuncios'");
    expect(migration).not.toContain("('Preguntas', 'preguntas'");
    expect(migration).not.toContain("('Eventos', 'eventos'");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS channel_id uuid");
    expect(migration).toContain("WITH tribe_general_channels AS");
    expect(migration).toContain("UPDATE public.posts");
    expect(migration).toContain("SET");
    expect(migration).toContain("channel_id = tribe_general_channels.id");
    expect(migration).toContain("posts.tribe_id = tribe_general_channels.tribe_id");
    expect(migration).toContain("ALTER COLUMN channel_id SET NOT NULL");
    expect(migration).toContain("REFERENCES public.tribe_channels(id)");
    expect(migration).not.toContain("DELETE FROM public.posts");
  });

  it("moves obsolete initial channel posts into General before deleting those channels", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260426050000_keep_only_general_initial_channel.sql"
    );

    expect(migration).toContain("WITH general_channels AS");
    expect(migration).toContain("UPDATE public.posts");
    expect(migration).toContain("channel_id = general_channels.id");
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
    expect(incrementalMigration).toContain("Leaders and guardians can move posts between channels");
    expect(incrementalMigration).toContain("ON public.posts");
    expect(incrementalMigration).toContain("FOR UPDATE");
  });

  it("forces RLS and limits write participation to active members", () => {
    const migration = readWorkspaceFile(postsMigrationPath);

    expect(migration).toContain("ALTER TABLE public.posts FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.post_comments FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.post_reactions FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("public.is_active_tribe_member(tribe_id)");
    expect(migration).toContain("public.can_read_tribe_content(tribe_id)");
  });
});
