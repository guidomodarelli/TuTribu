import type { POST_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import type {
  CommunityFeedCommentResult,
  CommunityFeedPostResult,
} from "@/src/modules/posts/application/results/community-feed-result";

export type PostCreationResult =
  | {
      post: CommunityFeedPostResult;
      status: typeof POST_MUTATION_STATUS.created;
    }
  | {
      status:
        | typeof POST_MUTATION_STATUS.forbidden
        | typeof POST_MUTATION_STATUS.invalidContent
        | typeof POST_MUTATION_STATUS.notFound;
    };

export type PostCommentCreationResult =
  | {
      comment: CommunityFeedCommentResult;
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
