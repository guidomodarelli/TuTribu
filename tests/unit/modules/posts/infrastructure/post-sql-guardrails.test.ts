import { readFileSync } from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Post SQL guardrails", () => {
  const postsMigrationPath =
    "database/migrations/20260426010000_create_community_posts_feed.sql";

  it("creates tenant-scoped post tables with a single like per user and post", () => {
    const migration = readWorkspaceFile(postsMigrationPath);

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.posts");
    expect(migration).toContain("community_id uuid NOT NULL REFERENCES public.communities(id)");
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

  it("forces RLS and limits write participation to active members", () => {
    const migration = readWorkspaceFile(postsMigrationPath);

    expect(migration).toContain("ALTER TABLE public.posts FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.post_comments FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.post_reactions FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("public.is_active_community_member(community_id)");
    expect(migration).toContain("public.can_read_community_content(community_id)");
  });
});
