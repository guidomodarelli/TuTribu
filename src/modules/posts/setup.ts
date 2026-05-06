import { createTribePost } from "@/src/modules/posts/application/use-cases/create-tribe-post-use-case";
import { createPostComment } from "@/src/modules/posts/application/use-cases/create-post-comment-use-case";
import { listTribeFeed } from "@/src/modules/posts/application/use-cases/list-tribe-feed-use-case";
import {
  createTribeChannel,
  deleteTribeChannel,
  listTribeChannels,
  updateTribeChannel,
} from "@/src/modules/posts/application/use-cases/manage-tribe-channels-use-cases";
import { togglePostLike } from "@/src/modules/posts/application/use-cases/toggle-post-like-use-case";
import type {
  CreateTribePostCommand,
  CreateTribeChannelCommand,
  CreatePostCommentCommand,
  DeleteTribeChannelCommand,
  TogglePostLikeCommand,
  UpdateTribeChannelCommand,
} from "@/src/modules/posts/application/commands/tribe-post-command";
import type { TribeFeedResult } from "@/src/modules/posts/application/results/tribe-feed-result";
import type {
  TribeChannelCreationResult,
  TribeChannelDeletionResult,
  TribeChannelListResult,
  TribeChannelUpdateResult,
} from "@/src/modules/posts/application/results/tribe-channel-result";
import type {
  PostCommentCreationResult,
  PostCreationResult,
  PostLikeToggleResult,
} from "@/src/modules/posts/application/results/post-mutation-result";
import type { PostCommentRepository } from "@/src/modules/posts/domain/repositories/post-comment-repository";
import type { TribeChannelRepository } from "@/src/modules/posts/domain/repositories/tribe-channel-repository";
import type { PostCreationRepository } from "@/src/modules/posts/domain/repositories/post-creation-repository";
import type {
  ListTribeFeedQuery,
  PostFeedReadRepository,
} from "@/src/modules/posts/domain/repositories/post-feed-read-repository";
import type { PostReactionRepository } from "@/src/modules/posts/domain/repositories/post-reaction-repository";

type PostsModuleDependencies = {
  tribeChannelRepository: TribeChannelRepository;
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
    createTribeChannel: (
      command: CreateTribeChannelCommand
    ) => Promise<TribeChannelCreationResult>;
    deleteTribeChannel: (
      command: DeleteTribeChannelCommand
    ) => Promise<TribeChannelDeletionResult>;
    createPostComment: (
      command: CreatePostCommentCommand
    ) => Promise<PostCommentCreationResult>;
    listTribeFeed: (query: ListTribeFeedQuery) => Promise<TribeFeedResult>;
    listTribeChannels: (
      query: ListTribeFeedQuery
    ) => Promise<TribeChannelListResult>;
    togglePostLike: (command: TogglePostLikeCommand) => Promise<PostLikeToggleResult>;
    updateTribeChannel: (
      command: UpdateTribeChannelCommand
    ) => Promise<TribeChannelUpdateResult>;
  };
};

export function buildPostsModule({
  tribeChannelRepository,
  postCommentRepository,
  postCreationRepository,
  postFeedReadRepository,
  postReactionRepository,
}: PostsModuleDependencies): PostsModule {
  return {
    useCases: {
      createTribePost: createTribePost({ postCreationRepository }),
      createTribeChannel: createTribeChannel({
        tribeChannelRepository,
      }),
      deleteTribeChannel: deleteTribeChannel({
        tribeChannelRepository,
      }),
      createPostComment: createPostComment({ postCommentRepository }),
      listTribeFeed: listTribeFeed({ postFeedReadRepository }),
      listTribeChannels: listTribeChannels({
        tribeChannelRepository,
      }),
      togglePostLike: togglePostLike({ postReactionRepository }),
      updateTribeChannel: updateTribeChannel({
        tribeChannelRepository,
      }),
    },
  };
}
