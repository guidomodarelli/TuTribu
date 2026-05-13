import type { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import type {
  TribeRoundReplyResult,
  TribeRoundMessageResult,
} from "@/src/modules/messages/application/results/tribe-round-result";

export type MessageCreationResult =
  | {
      message: TribeRoundMessageResult;
      status: typeof MESSAGE_MUTATION_STATUS.created;
    }
  | {
      status:
        | typeof MESSAGE_MUTATION_STATUS.forbidden
        | typeof MESSAGE_MUTATION_STATUS.invalidChannel
        | typeof MESSAGE_MUTATION_STATUS.invalidContent
        | typeof MESSAGE_MUTATION_STATUS.notFound;
    };

export type MessageReplyCreationResult =
  | {
      reply: TribeRoundReplyResult;
      status: typeof MESSAGE_MUTATION_STATUS.created;
    }
  | {
      status:
        | typeof MESSAGE_MUTATION_STATUS.forbidden
        | typeof MESSAGE_MUTATION_STATUS.invalidContent
        | typeof MESSAGE_MUTATION_STATUS.notFound;
    };

export type MessageLikeToggleResult = {
  likedByViewer: boolean;
  likeCount: number;
  status:
    | typeof MESSAGE_MUTATION_STATUS.liked
    | typeof MESSAGE_MUTATION_STATUS.unliked
    | typeof MESSAGE_MUTATION_STATUS.forbidden
    | typeof MESSAGE_MUTATION_STATUS.notFound;
};

export type MessagePinToggleResult = {
  isPinned: boolean;
  pinnedAt: string | null;
  status:
    | typeof MESSAGE_MUTATION_STATUS.pinned
    | typeof MESSAGE_MUTATION_STATUS.unpinned
    | typeof MESSAGE_MUTATION_STATUS.pinLimitReached
    | typeof MESSAGE_MUTATION_STATUS.forbidden
    | typeof MESSAGE_MUTATION_STATUS.notFound;
};
