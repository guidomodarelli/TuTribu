import type { POST_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import type {
  TribeFeedCommentResult,
  TribeFeedPostResult,
} from "@/src/modules/posts/application/results/tribe-feed-result";

export type PostCreationResult =
  | {
      post: TribeFeedPostResult;
      status: typeof POST_MUTATION_STATUS.created;
    }
  | {
      status:
        | typeof POST_MUTATION_STATUS.forbidden
        | typeof POST_MUTATION_STATUS.invalidCategory
        | typeof POST_MUTATION_STATUS.invalidContent
        | typeof POST_MUTATION_STATUS.notFound;
    };

export type PostCommentCreationResult =
  | {
      comment: TribeFeedCommentResult;
      status: typeof POST_MUTATION_STATUS.created;
    }
  | {
      status:
        | typeof POST_MUTATION_STATUS.forbidden
        | typeof POST_MUTATION_STATUS.invalidContent
        | typeof POST_MUTATION_STATUS.notFound;
    };

export type PostLikeToggleResult = {
  likedByViewer: boolean;
  likeCount: number;
  status:
    | typeof POST_MUTATION_STATUS.liked
    | typeof POST_MUTATION_STATUS.unliked
    | typeof POST_MUTATION_STATUS.forbidden
    | typeof POST_MUTATION_STATUS.notFound;
};
