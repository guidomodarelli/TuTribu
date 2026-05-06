import { createTribePost } from "@/src/modules/posts/application/use-cases/create-tribe-post-use-case";
import { createPostComment } from "@/src/modules/posts/application/use-cases/create-post-comment-use-case";
import { listTribeFeed } from "@/src/modules/posts/application/use-cases/list-tribe-feed-use-case";
import {
  createTribePostCategory,
  deleteTribePostCategory,
  listTribePostCategories,
  updateTribePostCategory,
} from "@/src/modules/posts/application/use-cases/manage-post-categories-use-cases";
import { togglePostLike } from "@/src/modules/posts/application/use-cases/toggle-post-like-use-case";
import type {
  CreateTribePostCommand,
  CreateTribePostCategoryCommand,
  CreatePostCommentCommand,
  DeleteTribePostCategoryCommand,
  TogglePostLikeCommand,
  UpdateTribePostCategoryCommand,
} from "@/src/modules/posts/application/commands/tribe-post-command";
import type { TribeFeedResult } from "@/src/modules/posts/application/results/tribe-feed-result";
import type {
  PostCategoryCreationResult,
  PostCategoryDeletionResult,
  PostCategoryListResult,
  PostCategoryUpdateResult,
} from "@/src/modules/posts/application/results/post-category-result";
import type {
  PostCommentCreationResult,
  PostCreationResult,
  PostLikeToggleResult,
} from "@/src/modules/posts/application/results/post-mutation-result";
import type { PostCommentRepository } from "@/src/modules/posts/domain/repositories/post-comment-repository";
import type { PostCategoryRepository } from "@/src/modules/posts/domain/repositories/post-category-repository";
import type { PostCreationRepository } from "@/src/modules/posts/domain/repositories/post-creation-repository";
import type {
  ListTribeFeedQuery,
  PostFeedReadRepository,
} from "@/src/modules/posts/domain/repositories/post-feed-read-repository";
import type { PostReactionRepository } from "@/src/modules/posts/domain/repositories/post-reaction-repository";

type PostsModuleDependencies = {
  postCategoryRepository: PostCategoryRepository;
  postCommentRepository: PostCommentRepository;
  postCreationRepository: PostCreationRepository;
  postFeedReadRepository: PostFeedReadRepository;
  postReactionRepository: PostReactionRepository;
};

type PostsModule = {
  useCases: {
    createTribePost: (
      command: CreateTribePostCommand
    ) => Promise<PostCreationResult>;
    createTribePostCategory: (
      command: CreateTribePostCategoryCommand
    ) => Promise<PostCategoryCreationResult>;
    deleteTribePostCategory: (
      command: DeleteTribePostCategoryCommand
    ) => Promise<PostCategoryDeletionResult>;
    createPostComment: (
      command: CreatePostCommentCommand
    ) => Promise<PostCommentCreationResult>;
    listTribeFeed: (query: ListTribeFeedQuery) => Promise<TribeFeedResult>;
    listTribePostCategories: (
      query: ListTribeFeedQuery
    ) => Promise<PostCategoryListResult>;
    togglePostLike: (command: TogglePostLikeCommand) => Promise<PostLikeToggleResult>;
    updateTribePostCategory: (
      command: UpdateTribePostCategoryCommand
    ) => Promise<PostCategoryUpdateResult>;
  };
};

export function buildPostsModule({
  postCategoryRepository,
  postCommentRepository,
  postCreationRepository,
  postFeedReadRepository,
  postReactionRepository,
}: PostsModuleDependencies): PostsModule {
  return {
    useCases: {
      createTribePost: createTribePost({ postCreationRepository }),
      createTribePostCategory: createTribePostCategory({
        postCategoryRepository,
      }),
      deleteTribePostCategory: deleteTribePostCategory({
        postCategoryRepository,
      }),
      createPostComment: createPostComment({ postCommentRepository }),
      listTribeFeed: listTribeFeed({ postFeedReadRepository }),
      listTribePostCategories: listTribePostCategories({
        postCategoryRepository,
      }),
      togglePostLike: togglePostLike({ postReactionRepository }),
      updateTribePostCategory: updateTribePostCategory({
        postCategoryRepository,
      }),
    },
  };
}
