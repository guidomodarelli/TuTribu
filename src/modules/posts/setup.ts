import { createCommunityPost } from "@/src/modules/posts/application/use-cases/create-community-post-use-case";
import { createPostComment } from "@/src/modules/posts/application/use-cases/create-post-comment-use-case";
import { listCommunityFeed } from "@/src/modules/posts/application/use-cases/list-community-feed-use-case";
import {
  createCommunityPostCategory,
  deleteCommunityPostCategory,
  listCommunityPostCategories,
  updateCommunityPostCategory,
} from "@/src/modules/posts/application/use-cases/manage-post-categories-use-cases";
import { togglePostLike } from "@/src/modules/posts/application/use-cases/toggle-post-like-use-case";
import type {
  CreateCommunityPostCommand,
  CreateCommunityPostCategoryCommand,
  CreatePostCommentCommand,
  DeleteCommunityPostCategoryCommand,
  TogglePostLikeCommand,
  UpdateCommunityPostCategoryCommand,
} from "@/src/modules/posts/application/commands/community-post-command";
import type { CommunityFeedResult } from "@/src/modules/posts/application/results/community-feed-result";
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
  ListCommunityFeedQuery,
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
    createCommunityPost: (
      command: CreateCommunityPostCommand
    ) => Promise<PostCreationResult>;
    createCommunityPostCategory: (
      command: CreateCommunityPostCategoryCommand
    ) => Promise<PostCategoryCreationResult>;
    deleteCommunityPostCategory: (
      command: DeleteCommunityPostCategoryCommand
    ) => Promise<PostCategoryDeletionResult>;
    createPostComment: (
      command: CreatePostCommentCommand
    ) => Promise<PostCommentCreationResult>;
    listCommunityFeed: (query: ListCommunityFeedQuery) => Promise<CommunityFeedResult>;
    listCommunityPostCategories: (
      query: ListCommunityFeedQuery
    ) => Promise<PostCategoryListResult>;
    togglePostLike: (command: TogglePostLikeCommand) => Promise<PostLikeToggleResult>;
    updateCommunityPostCategory: (
      command: UpdateCommunityPostCategoryCommand
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
      createCommunityPost: createCommunityPost({ postCreationRepository }),
      createCommunityPostCategory: createCommunityPostCategory({
        postCategoryRepository,
      }),
      deleteCommunityPostCategory: deleteCommunityPostCategory({
        postCategoryRepository,
      }),
      createPostComment: createPostComment({ postCommentRepository }),
      listCommunityFeed: listCommunityFeed({ postFeedReadRepository }),
      listCommunityPostCategories: listCommunityPostCategories({
        postCategoryRepository,
      }),
      togglePostLike: togglePostLike({ postReactionRepository }),
      updateCommunityPostCategory: updateCommunityPostCategory({
        postCategoryRepository,
      }),
    },
  };
}
