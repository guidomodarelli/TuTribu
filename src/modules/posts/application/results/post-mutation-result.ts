import type { POST_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";

export type PostCreationResult =
  | {
      status: typeof POST_MUTATION_STATUS.created;
    }
  | {
      status:
        | typeof POST_MUTATION_STATUS.forbidden
        | typeof POST_MUTATION_STATUS.invalidContent
        | typeof POST_MUTATION_STATUS.notFound;
    };

export type PostCommentCreationResult = PostCreationResult;

export type PostLikeToggleResult = {
  likedByViewer: boolean;
  status:
    | typeof POST_MUTATION_STATUS.liked
    | typeof POST_MUTATION_STATUS.unliked
    | typeof POST_MUTATION_STATUS.forbidden
    | typeof POST_MUTATION_STATUS.notFound;
};
