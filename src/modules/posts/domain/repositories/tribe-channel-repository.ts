import type {
  CreateTribeChannelCommand,
  DeleteTribeChannelCommand,
  UpdateTribeChannelCommand,
} from "@/src/modules/posts/application/commands/tribe-post-command";
import type { TribeChannelResult } from "@/src/modules/posts/application/results/tribe-feed-result";
import type {
  TribeChannelCreationResult,
  TribeChannelDeletionResult,
  TribeChannelUpdateResult,
} from "@/src/modules/posts/application/results/tribe-channel-result";

export type ListTribeChannelsQuery = {
  tribeSlug: string;
};

export interface TribeChannelRepository {
  create(
    command: CreateTribeChannelCommand
  ): Promise<TribeChannelCreationResult>;
  delete(
    command: DeleteTribeChannelCommand
  ): Promise<TribeChannelDeletionResult>;
  listByTribeSlug(
    query: ListTribeChannelsQuery
  ): Promise<TribeChannelResult[]>;
  update(
    command: UpdateTribeChannelCommand
  ): Promise<TribeChannelUpdateResult>;
}
