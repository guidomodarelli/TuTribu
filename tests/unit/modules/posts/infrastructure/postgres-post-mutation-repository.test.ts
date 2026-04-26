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
        content: "Primera publicación",
        title: "Anuncio inicial",
      })
    ).resolves.toEqual({
      status: "created",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("insert into public.posts");
    expect(sqlText).toContain("(community_id, author_id, title, content, updated_at)");
    expect(sqlText).toContain(
      "where public.is_active_community_member(target_community.id)"
    );
  });

  it("toggles likes with an active-member write guard and idempotent upsert", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          status: "liked",
        },
      ],
    }));
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
      status: "liked",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain(
      "and public.is_active_community_member(target_post.community_id)"
    );
    expect(sqlText).toContain("on conflict (post_id, user_id) do update");
    expect(sqlText).toContain("set type = excluded.type");
  });
});
