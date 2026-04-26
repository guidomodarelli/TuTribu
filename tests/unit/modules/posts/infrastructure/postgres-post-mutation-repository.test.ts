import { PostgresPostMutationRepository } from "@/src/modules/posts/infrastructure/repositories/postgres-post-mutation-repository";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      return "";
    })
    .join("");
}

describe("PostgresPostMutationRepository", () => {
  it("creates posts with a title and an active-member write guard", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          author_id: "member-1",
          author_image: null,
          author_name: "Grace Hopper",
          author_role: "member",
          category_access_scope: "members",
          category_emoji: "💬",
          category_id: "category-general",
          category_name: "General",
          category_slug: "general",
          category_sort_order: 20,
          post_content: "Primera publicación",
          post_created_at: "2026-04-26T12:00:00.000Z",
          post_id: "post-1",
          post_title: "Anuncio inicial",
          status: "created",
        },
      ],
    }));
    const repository = new PostgresPostMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        authorId: "member-1",
        categoryId: "category-general",
        communitySlug: "matematica-pro",
        content: "Primera publicación",
        title: "Anuncio inicial",
      })
    ).resolves.toEqual({
      post: {
        id: "post-1",
        category: {
          accessScope: "members",
          emoji: "💬",
          id: "category-general",
          name: "General",
          slug: "general",
          sortOrder: 20,
        },
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        },
        comments: [],
        content: "Primera publicación",
        createdAt: "2026-04-26T12:00:00.000Z",
        likedByViewer: false,
        likeCount: 0,
        title: "Anuncio inicial",
      },
      status: "created",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("insert into public.posts");
    expect(sqlText).toContain(
      "(community_id, category_id, author_id, title, content, created_at, updated_at)"
    );
    expect(sqlText).toContain("target_category");
    expect(sqlText).toContain(
      "where public.is_active_community_member(target_community.id)"
    );
    expect(sqlText).toContain("returning");
    expect(sqlText).toContain("post_authors.name as author_name");
  });

  it("toggles likes with an active-member write guard and idempotent upsert", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_write: true,
            community_id: "community-1",
            post_id: "post-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "reaction-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            like_count: "3",
          },
        ],
      });
    const repository = new PostgresPostMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.toggle({
        communitySlug: "matematica-pro",
        postId: "post-1",
        userId: "member-1",
      })
    ).resolves.toEqual({
      likedByViewer: true,
      likeCount: 3,
      status: "liked",
    });

    const targetPostSqlText = getSqlText(execute.mock.calls[0]?.[0]);
    const deleteSqlText = getSqlText(execute.mock.calls[1]?.[0]);
    const insertSqlText = getSqlText(execute.mock.calls[2]?.[0]);
    const countSqlText = getSqlText(execute.mock.calls[3]?.[0]);

    expect(targetPostSqlText).toContain(
      "public.is_active_community_member(posts.community_id) as can_write"
    );
    expect(deleteSqlText).toContain("delete from public.post_reactions");
    expect(insertSqlText).toContain(
      "(post_id, community_id, user_id, type, created_at)"
    );
    expect(insertSqlText).toContain("on conflict (post_id, user_id) do nothing");
    expect(countSqlText).toContain("count(*) as like_count");
  });

  it("creates comments with the returned comment view model", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          comment_author_id: "member-1",
          comment_author_image: null,
          comment_author_name: "Grace Hopper",
          comment_author_role: "member",
          comment_content: "Excelente clase",
          comment_created_at: "2026-04-26T12:05:00.000Z",
          comment_id: "comment-1",
          status: "created",
        },
      ],
    }));
    const repository = new PostgresPostMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        authorId: "member-1",
        communitySlug: "matematica-pro",
        content: "Excelente clase",
        postId: "post-1",
      })
    ).resolves.toEqual({
      comment: {
        id: "comment-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "member",
          avatarFallback: "GH",
          image: null,
        },
        content: "Excelente clase",
        createdAt: "2026-04-26T12:05:00.000Z",
      },
      status: "created",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("insert into public.post_comments");
    expect(sqlText).toContain("(post_id, community_id, author_id, content, created_at)");
    expect(sqlText).toContain("comment_authors.name as comment_author_name");
  });
});
