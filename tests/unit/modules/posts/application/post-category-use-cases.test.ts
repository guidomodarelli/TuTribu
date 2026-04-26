import {
  createCommunityPostCategory,
  deleteCommunityPostCategory,
  updateCommunityPostCategory,
} from "@/src/modules/posts/application/use-cases/manage-post-categories-use-cases";

describe("post category use cases", () => {
  const category = {
    accessScope: "members" as const,
    emoji: "💬",
    id: "category-general",
    name: "General",
    slug: "general",
    sortOrder: 20,
  };

  it("creates a category when the name and emoji are valid", async () => {
    const create = jest.fn(async () => ({
      category,
      status: "created" as const,
    }));
    const execute = createCommunityPostCategory({
      postCategoryRepository: {
        create,
        delete: jest.fn(),
        listByCommunitySlug: jest.fn(),
        update: jest.fn(),
      },
    });

    await expect(
      execute({
        communitySlug: "matematica-pro",
        emoji: " 💬 ",
        name: " General ",
      })
    ).resolves.toEqual({ category, status: "created" });
    expect(create).toHaveBeenCalledWith({
      communitySlug: "matematica-pro",
      emoji: "💬",
      name: "General",
    });
  });

  it("rejects a category without name before calling the repository", async () => {
    const create = jest.fn();
    const execute = createCommunityPostCategory({
      postCategoryRepository: {
        create,
        delete: jest.fn(),
        listByCommunitySlug: jest.fn(),
        update: jest.fn(),
      },
    });

    await expect(
      execute({
        communitySlug: "matematica-pro",
        emoji: "💬",
        name: "   ",
      })
    ).resolves.toEqual({ status: "invalid_name" });
    expect(create).not.toHaveBeenCalled();
  });

  it("updates a category with normalized text", async () => {
    const update = jest.fn(async () => ({
      category,
      status: "updated" as const,
    }));
    const execute = updateCommunityPostCategory({
      postCategoryRepository: {
        create: jest.fn(),
        delete: jest.fn(),
        listByCommunitySlug: jest.fn(),
        update,
      },
    });

    await expect(
      execute({
        categoryId: " category-general ",
        communitySlug: " matematica-pro ",
        emoji: " 💬 ",
        name: " General ",
        sortOrder: 20,
      })
    ).resolves.toEqual({ category, status: "updated" });
    expect(update).toHaveBeenCalledWith({
      categoryId: "category-general",
      communitySlug: "matematica-pro",
      emoji: "💬",
      name: "General",
      sortOrder: 20,
    });
  });

  it("passes the target category when deleting a category with posts", async () => {
    const deleteCategory = jest.fn(async () => ({
      status: "moved_and_deleted" as const,
    }));
    const execute = deleteCommunityPostCategory({
      postCategoryRepository: {
        create: jest.fn(),
        delete: deleteCategory,
        listByCommunitySlug: jest.fn(),
        update: jest.fn(),
      },
    });

    await expect(
      execute({
        categoryId: " category-questions ",
        communitySlug: " matematica-pro ",
        targetCategoryId: " category-general ",
      })
    ).resolves.toEqual({ status: "moved_and_deleted" });
    expect(deleteCategory).toHaveBeenCalledWith({
      categoryId: "category-questions",
      communitySlug: "matematica-pro",
      targetCategoryId: "category-general",
    });
  });

  it("omits targetCategoryId when delete request sends an empty value", async () => {
    const deleteCategory = jest.fn(async () => ({
      status: "deleted" as const,
    }));
    const execute = deleteCommunityPostCategory({
      postCategoryRepository: {
        create: jest.fn(),
        delete: deleteCategory,
        listByCommunitySlug: jest.fn(),
        update: jest.fn(),
      },
    });

    await expect(
      execute({
        categoryId: " category-questions ",
        communitySlug: " matematica-pro ",
        targetCategoryId: "   ",
      })
    ).resolves.toEqual({ status: "deleted" });
    expect(deleteCategory).toHaveBeenCalledWith({
      categoryId: "category-questions",
      communitySlug: "matematica-pro",
      targetCategoryId: undefined,
    });
  });
});
