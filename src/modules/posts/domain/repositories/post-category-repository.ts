import type {
  CreateCommunityPostCategoryCommand,
  DeleteCommunityPostCategoryCommand,
  UpdateCommunityPostCategoryCommand,
} from "@/src/modules/posts/application/commands/community-post-command";
import type { CommunityPostCategoryResult } from "@/src/modules/posts/application/results/community-feed-result";
import type {
  PostCategoryCreationResult,
  PostCategoryDeletionResult,
  PostCategoryUpdateResult,
} from "@/src/modules/posts/application/results/post-category-result";

export type ListCommunityPostCategoriesQuery = {
  communitySlug: string;
};

export interface PostCategoryRepository {
  create(
    command: CreateCommunityPostCategoryCommand
  ): Promise<PostCategoryCreationResult>;
  delete(
    command: DeleteCommunityPostCategoryCommand
  ): Promise<PostCategoryDeletionResult>;
  listByCommunitySlug(
    query: ListCommunityPostCategoriesQuery
  ): Promise<CommunityPostCategoryResult[]>;
  update(
    command: UpdateCommunityPostCategoryCommand
  ): Promise<PostCategoryUpdateResult>;
}
