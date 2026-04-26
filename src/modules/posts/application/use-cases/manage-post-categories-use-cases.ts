import type {
  CreateCommunityPostCategoryCommand,
  DeleteCommunityPostCategoryCommand,
  UpdateCommunityPostCategoryCommand,
} from "@/src/modules/posts/application/commands/community-post-command";
import type { PostCategoryListResult } from "@/src/modules/posts/application/results/post-category-result";
import {
  COMMUNITY_POST_CATEGORY_EMOJI,
  COMMUNITY_POST_CATEGORY_NAME,
  POST_CATEGORY_MUTATION_STATUS,
} from "@/src/modules/posts/constants/post-feed";
import type {
  ListCommunityPostCategoriesQuery,
  PostCategoryRepository,
} from "@/src/modules/posts/domain/repositories/post-category-repository";

type PostCategoryDependencies = {
  postCategoryRepository: PostCategoryRepository;
};

function normalizeText(value: string): string {
  return value.trim();
}

function isInvalidText(value: string, limits: { maxLength: number; minLength: number }): boolean {
  return value.length < limits.minLength || value.length > limits.maxLength;
}

function isInvalidCategoryInput(name: string, emoji: string): boolean {
  return (
    isInvalidText(name, COMMUNITY_POST_CATEGORY_NAME) ||
    isInvalidText(emoji, COMMUNITY_POST_CATEGORY_EMOJI)
  );
}

export function listCommunityPostCategories({
  postCategoryRepository,
}: PostCategoryDependencies) {
  return async (
    query: ListCommunityPostCategoriesQuery
  ): Promise<PostCategoryListResult> => ({
    categories: await postCategoryRepository.listByCommunitySlug({
      communitySlug: query.communitySlug.trim(),
    }),
  });
}

export function createCommunityPostCategory({
  postCategoryRepository,
}: PostCategoryDependencies) {
  return async (command: CreateCommunityPostCategoryCommand) => {
    const name = normalizeText(command.name);
    const emoji = normalizeText(command.emoji);

    if (isInvalidCategoryInput(name, emoji)) {
      return {
        status: POST_CATEGORY_MUTATION_STATUS.invalidName,
      };
    }

    return postCategoryRepository.create({
      communitySlug: command.communitySlug.trim(),
      emoji,
      name,
    });
  };
}

export function updateCommunityPostCategory({
  postCategoryRepository,
}: PostCategoryDependencies) {
  return async (command: UpdateCommunityPostCategoryCommand) => {
    const name = normalizeText(command.name);
    const emoji = normalizeText(command.emoji);

    if (isInvalidCategoryInput(name, emoji)) {
      return {
        status: POST_CATEGORY_MUTATION_STATUS.invalidName,
      };
    }

    return postCategoryRepository.update({
      categoryId: command.categoryId.trim(),
      communitySlug: command.communitySlug.trim(),
      emoji,
      name,
      sortOrder: command.sortOrder,
    });
  };
}

export function deleteCommunityPostCategory({
  postCategoryRepository,
}: PostCategoryDependencies) {
  return async (command: DeleteCommunityPostCategoryCommand) => {
    const normalizedTargetCategoryId = command.targetCategoryId?.trim();

    return postCategoryRepository.delete({
      categoryId: command.categoryId.trim(),
      communitySlug: command.communitySlug.trim(),
      targetCategoryId: normalizedTargetCategoryId || undefined,
    });
  };
}
