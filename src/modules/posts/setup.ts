import { createCommunityPost } from "@/src/modules/posts/application/use-cases/create-community-post-use-case";
import { createPostComment } from "@/src/modules/posts/application/use-cases/create-post-comment-use-case";
import { listCommunityFeed } from "@/src/modules/posts/application/use-cases/list-community-feed-use-case";
import { togglePostLike } from "@/src/modules/posts/application/use-cases/toggle-post-like-use-case";
import type {
  CreateCommunityPostCommand,
  CreatePostCommentCommand,
  TogglePostLikeCommand,
} from "@/src/modules/posts/application/commands/community-post-command";
import type {
  PostCommentCreationResult,
  PostCreationResult,
  PostLikeToggleResult,
} from "@/src/modules/posts/application/results/post-mutation-result";
import type { PostCommentRepository } from "@/src/modules/posts/domain/repositories/post-comment-repository";
import type { PostCreationRepository } from "@/src/modules/posts/domain/repositories/post-creation-repository";
import type {
  ListCommunityFeedQuery,
  PostFeedReadRepository,
} from "@/src/modules/posts/domain/repositories/post-feed-read-repository";
import type { PostReactionRepository } from "@/src/modules/posts/domain/repositories/post-reaction-repository";
import type { CommunityFeedResult } from "@/src/modules/posts/application/results/community-feed-result";

type PostsModuleDependencies = {
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
    createPostComment: (
      command: CreatePostCommentCommand
    ) => Promise<PostCommentCreationResult>;
    listCommunityFeed: (query: ListCommunityFeedQuery) => Promise<CommunityFeedResult>;
    togglePostLike: (command: TogglePostLikeCommand) => Promise<PostLikeToggleResult>;
  };
};

export function buildPostsModule({
  postCommentRepository,
  postCreationRepository,
  postFeedReadRepository,
  postReactionRepository,
}: PostsModuleDependencies): PostsModule {
  return {
    useCases: {
      createCommunityPost: createCommunityPost({ postCreationRepository }),
      createPostComment: createPostComment({ postCommentRepository }),
      listCommunityFeed: listCommunityFeed({ postFeedReadRepository }),
      togglePostLike: togglePostLike({ postReactionRepository }),
    },
  };
}
