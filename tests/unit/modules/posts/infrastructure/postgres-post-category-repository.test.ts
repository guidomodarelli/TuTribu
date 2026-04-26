import { PostgresPostCategoryRepository } from "@/src/modules/posts/infrastructure/repositories/postgres-post-category-repository";

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

describe("PostgresPostCategoryRepository", () => {
  it("lists community categories ordered for the feed", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          access_scope: "members",
          emoji: "💬",
          id: "category-general",
          name: "General",
          slug: "general",
          sort_order: "20",
        },
      ],
    }));
    const repository = new PostgresPostCategoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByCommunitySlug({ communitySlug: "matematica-pro" })
    ).resolves.toEqual([
      {
        accessScope: "members",
        emoji: "💬",
        id: "category-general",
        name: "General",
        slug: "general",
        sortOrder: 20,
      },
    ]);

    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "order by community_post_categories.sort_order asc"
    );
  });

  it("creates categories guarded by owner or admin membership", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          access_scope: "members",
          emoji: "❓",
          id: "category-questions",
          name: "Preguntas",
          slug: "preguntas",
          sort_order: 30,
          status: "created",
        },
      ],
    }));
    const repository = new PostgresPostCategoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        communitySlug: "matematica-pro",
        emoji: "❓",
        name: "Preguntas",
      })
    ).resolves.toMatchObject({
      category: {
        id: "category-questions",
        slug: "preguntas",
      },
      status: "created",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("public.can_manage_community_categories");
    expect(sqlText).toContain("insert into public.community_post_categories");
    expect(sqlText).toContain("existing_category");
  });

  it("maps duplicate category slugs to a controlled creation status", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          status: "duplicate_slug",
        },
      ],
    }));
    const repository = new PostgresPostCategoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        communitySlug: "matematica-pro",
        emoji: "💬",
        name: "General",
      })
    ).resolves.toEqual({ status: "duplicate_slug" });
  });

  it("maps unique violations to duplicate_slug during category creation", async () => {
    const execute = jest.fn(async () => {
      throw {
        code: "23505",
        constraint: "community_post_categories_community_id_slug_key",
      };
    });
    const repository = new PostgresPostCategoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        communitySlug: "matematica-pro",
        emoji: "💬",
        name: "General",
      })
    ).resolves.toEqual({ status: "duplicate_slug" });
  });

  it("maps duplicate category slugs to a controlled update status", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          status: "duplicate_slug",
        },
      ],
    }));
    const repository = new PostgresPostCategoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.update({
        categoryId: "category-questions",
        communitySlug: "matematica-pro",
        emoji: "💬",
        name: "General",
        sortOrder: 30,
      })
    ).resolves.toEqual({ status: "duplicate_slug" });

    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain("existing_category");
  });

  it("maps unique violations to duplicate_slug during category updates", async () => {
    const execute = jest.fn(async () => {
      throw {
        code: "23505",
        constraint: "community_post_categories_community_id_slug_key",
      };
    });
    const repository = new PostgresPostCategoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.update({
        categoryId: "category-questions",
        communitySlug: "matematica-pro",
        emoji: "💬",
        name: "General",
        sortOrder: 30,
      })
    ).resolves.toEqual({ status: "duplicate_slug" });
  });

  it("returns not_found when updating a category that does not exist", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          status: "not_found",
        },
      ],
    }));
    const repository = new PostgresPostCategoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.update({
        categoryId: "category-missing",
        communitySlug: "matematica-pro",
        emoji: "💬",
        name: "General",
        sortOrder: 30,
      })
    ).resolves.toEqual({ status: "not_found" });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("target_category");
    expect(sqlText).toContain("when not exists (select 1 from target_category)");
  });

  it("moves posts before deleting a category when a target is provided", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          status: "moved_and_deleted",
        },
      ],
    }));
    const repository = new PostgresPostCategoryRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.delete({
        categoryId: "category-questions",
        communitySlug: "matematica-pro",
        targetCategoryId: "category-general",
      })
    ).resolves.toEqual({ status: "moved_and_deleted" });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("update public.posts");
    expect(sqlText).toContain("delete from public.community_post_categories");
    expect(sqlText).toContain("category_count");
  });
});
