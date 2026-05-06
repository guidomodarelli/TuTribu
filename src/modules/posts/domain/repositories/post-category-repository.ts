import type {
  CreateTribePostCategoryCommand,
  DeleteTribePostCategoryCommand,
  UpdateTribePostCategoryCommand,
} from "@/src/modules/posts/application/commands/tribe-post-command";
import type { TribePostCategoryResult } from "@/src/modules/posts/application/results/tribe-feed-result";
import type {
  PostCategoryCreationResult,
  PostCategoryDeletionResult,
  PostCategoryUpdateResult,
} from "@/src/modules/posts/application/results/post-category-result";

export type ListTribePostCategoriesQuery = {
  tribeSlug: string;
};

export interface PostCategoryRepository {
  create(
    command: CreateTribePostCategoryCommand
  ): Promise<PostCategoryCreationResult>;
  delete(
    command: DeleteTribePostCategoryCommand
  ): Promise<PostCategoryDeletionResult>;
  listByTribeSlug(
    query: ListTribePostCategoriesQuery
  ): Promise<TribePostCategoryResult[]>;
  update(
    command: UpdateTribePostCategoryCommand
  ): Promise<PostCategoryUpdateResult>;
}
