import type {
  CreateTribePostCategoryCommand,
  DeleteTribePostCategoryCommand,
  UpdateTribePostCategoryCommand,
} from "@/src/modules/posts/application/commands/tribe-post-command";
import type { PostCategoryListResult } from "@/src/modules/posts/application/results/post-category-result";
import {
  TRIBE_POST_CATEGORY_EMOJI,
  TRIBE_POST_CATEGORY_NAME,
  POST_CATEGORY_MUTATION_STATUS,
} from "@/src/modules/posts/constants/post-feed";
import type {
  ListTribePostCategoriesQuery,
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
    isInvalidText(name, TRIBE_POST_CATEGORY_NAME) ||
    isInvalidText(emoji, TRIBE_POST_CATEGORY_EMOJI)
  );
}

export function listTribePostCategories({
  postCategoryRepository,
}: PostCategoryDependencies) {
  return async (
    query: ListTribePostCategoriesQuery
  ): Promise<PostCategoryListResult> => ({
    categories: await postCategoryRepository.listByTribeSlug({
      tribeSlug: query.tribeSlug.trim(),
    }),
  });
}

export function createTribePostCategory({
  postCategoryRepository,
}: PostCategoryDependencies) {
  return async (command: CreateTribePostCategoryCommand) => {
    const name = normalizeText(command.name);
    const emoji = normalizeText(command.emoji);

    if (isInvalidCategoryInput(name, emoji)) {
      return {
        status: POST_CATEGORY_MUTATION_STATUS.invalidName,
      };
    }

    return postCategoryRepository.create({
      tribeSlug: command.tribeSlug.trim(),
      emoji,
      name,
    });
  };
}

export function updateTribePostCategory({
  postCategoryRepository,
}: PostCategoryDependencies) {
  return async (command: UpdateTribePostCategoryCommand) => {
    const name = normalizeText(command.name);
    const emoji = normalizeText(command.emoji);

    if (isInvalidCategoryInput(name, emoji)) {
      return {
        status: POST_CATEGORY_MUTATION_STATUS.invalidName,
      };
    }

    return postCategoryRepository.update({
      categoryId: command.categoryId.trim(),
      tribeSlug: command.tribeSlug.trim(),
      emoji,
      name,
      sortOrder: command.sortOrder,
    });
  };
}

export function deleteTribePostCategory({
  postCategoryRepository,
}: PostCategoryDependencies) {
  return async (command: DeleteTribePostCategoryCommand) => {
    const normalizedTargetCategoryId = command.targetCategoryId?.trim();

    return postCategoryRepository.delete({
      categoryId: command.categoryId.trim(),
      tribeSlug: command.tribeSlug.trim(),
      targetCategoryId: normalizedTargetCategoryId || undefined,
    });
  };
}
