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

  it("adds mandatory tribe post categories and preserves existing posts", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260426040000_add_tribe_post_categories.sql"
    );

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.tribe_post_categories");
    expect(migration).toContain("UNIQUE (tribe_id, slug)");
    expect(migration).toContain("('General', 'general', '💬', 20)");
    expect(migration).not.toContain("('Anuncios', 'anuncios'");
    expect(migration).not.toContain("('Preguntas', 'preguntas'");
    expect(migration).not.toContain("('Eventos', 'eventos'");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS category_id uuid");
    expect(migration).toContain("WITH tribe_general_categories AS");
    expect(migration).toContain("UPDATE public.posts");
    expect(migration).toContain("SET");
    expect(migration).toContain("category_id = tribe_general_categories.id");
    expect(migration).toContain("posts.tribe_id = tribe_general_categories.tribe_id");
    expect(migration).toContain("ALTER COLUMN category_id SET NOT NULL");
    expect(migration).toContain("REFERENCES public.tribe_post_categories(id)");
    expect(migration).not.toContain("DELETE FROM public.posts");
  });

  it("moves obsolete initial category posts into General before deleting those categories", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260426050000_keep_only_general_initial_category.sql"
    );

    expect(migration).toContain("WITH general_categories AS");
    expect(migration).toContain("UPDATE public.posts");
    expect(migration).toContain("category_id = general_categories.id");
    expect(migration).toContain("source_categories.slug IN ('anuncios', 'preguntas', 'eventos')");
    expect(migration).toContain("DELETE FROM public.tribe_post_categories obsolete_categories");
    expect(migration).toContain("obsolete_categories.slug IN ('anuncios', 'preguntas', 'eventos')");
  });

  it("limits category management to owners and admins", () => {
    const migration = readWorkspaceFile(
      "database/migrations/20260426040000_add_tribe_post_categories.sql"
    );
    const incrementalMigration = readWorkspaceFile(
      "database/migrations/20260426060000_limit_post_category_management_to_owners.sql"
    );

    expect(migration).toContain("public.can_manage_tribe_categories");
    expect(migration).toContain("tribe_members.role IN ('owner', 'admin')");
    expect(migration).toContain("ALTER TABLE public.tribe_post_categories FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("Owners and admins can manage tribe post categories");
    expect(incrementalMigration).toContain("CREATE OR REPLACE FUNCTION public.can_manage_tribe_categories");
    expect(incrementalMigration).toContain("tribe_members.role IN ('owner', 'admin')");
    expect(incrementalMigration).toContain("Owners and admins can manage tribe post categories");
    expect(incrementalMigration).toContain("Owners and admins can move posts between categories");
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
