import { MESSAGE_FILE_CLEANUP } from "@/src/modules/messages/constants/message-round";
import type {
  CleanupOrphanMessageFilesResult,
  MessageFileRepository,
} from "@/src/modules/messages/domain/repositories/message-file-repository";

type CleanupOrphanMessageFilesDependencies = {
  messageFileRepository: Pick<MessageFileRepository, "cleanupOrphanFiles">;
};

/**
 * Builds the use case that sweeps orphaned attachment files out of R2.
 *
 * It deletes the remote object for abandoned drafts past their TTL, message
 * files left in `pending_delete`, and the storage keys the tribe and user
 * delete triggers queued before their CASCADE removed the rows. The shared
 * CASCADE queue also carries course lesson file keys, and this sweep is the
 * single drainer for it. The TTL and batch size come from the
 * application-owned cleanup configuration.
 *
 * @param dependencies - Message file repository dependency.
 * @returns Use case function that runs one cleanup sweep.
 */
export function cleanupOrphanMessageFiles({
  messageFileRepository,
}: CleanupOrphanMessageFilesDependencies) {
  return async (): Promise<CleanupOrphanMessageFilesResult> =>
    messageFileRepository.cleanupOrphanFiles({
      abandonedDraftTtlHours: MESSAGE_FILE_CLEANUP.abandonedDraftTtlHours,
      batchLimit: MESSAGE_FILE_CLEANUP.batchLimit,
      interactiveDeleteGraceMinutes:
        MESSAGE_FILE_CLEANUP.interactiveDeleteGraceMinutes,
    });
}
