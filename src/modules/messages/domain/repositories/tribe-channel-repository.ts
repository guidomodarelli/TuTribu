import type {
  CreateTribeChannelCommand,
  DeleteTribeChannelCommand,
  UpdateTribeChannelCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
import type { TribeChannelResult } from "@/src/modules/messages/application/results/tribe-round-result";
import type {
  TribeChannelCreationResult,
  TribeChannelDeletionResult,
  TribeChannelUpdateResult,
} from "@/src/modules/messages/application/results/tribe-channel-result";

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
