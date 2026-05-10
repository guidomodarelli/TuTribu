import type { TRIBE_CHANNEL_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import type { TribeChannelResult } from "./tribe-round-result";

export type TribeChannelListResult = {
  channels: TribeChannelResult[];
};

export type TribeChannelCreationResult =
  | {
      channel: TribeChannelResult;
      status: typeof TRIBE_CHANNEL_MUTATION_STATUS.created;
    }
  | {
      status:
        | typeof TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug
        | typeof TRIBE_CHANNEL_MUTATION_STATUS.forbidden
        | typeof TRIBE_CHANNEL_MUTATION_STATUS.invalidName
        | typeof TRIBE_CHANNEL_MUTATION_STATUS.notFound;
    };

export type TribeChannelUpdateResult =
  | {
      channel: TribeChannelResult;
      status: typeof TRIBE_CHANNEL_MUTATION_STATUS.updated;
    }
  | {
      status:
        | typeof TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug
        | typeof TRIBE_CHANNEL_MUTATION_STATUS.forbidden
        | typeof TRIBE_CHANNEL_MUTATION_STATUS.invalidName
        | typeof TRIBE_CHANNEL_MUTATION_STATUS.notFound;
    };

export type TribeChannelDeletionResult = {
  status:
    | typeof TRIBE_CHANNEL_MUTATION_STATUS.channelHasMessages
    | typeof TRIBE_CHANNEL_MUTATION_STATUS.deleted
    | typeof TRIBE_CHANNEL_MUTATION_STATUS.forbidden
    | typeof TRIBE_CHANNEL_MUTATION_STATUS.invalidChannel
    | typeof TRIBE_CHANNEL_MUTATION_STATUS.lastChannel
    | typeof TRIBE_CHANNEL_MUTATION_STATUS.movedAndDeleted
    | typeof TRIBE_CHANNEL_MUTATION_STATUS.notFound;
};
