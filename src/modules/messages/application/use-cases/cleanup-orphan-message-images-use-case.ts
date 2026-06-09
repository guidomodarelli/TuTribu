import { MESSAGE_IMAGE_CLEANUP } from "@/src/modules/messages/constants/message-round";
import type {
  CleanupOrphanMessageImagesResult,
  MessageImageRepository,
} from "@/src/modules/messages/domain/repositories/message-image-repository";

type CleanupOrphanMessageImagesDependencies = {
  messageImageRepository: Pick<MessageImageRepository, "cleanupOrphanImages">;
};

/**
 * Builds the use case that sweeps orphaned message images out of Cloudflare.
 *
 * It deletes the remote asset for abandoned drafts past their TTL, message
 * images left in `pending_delete`, and the entries the tribe and user delete
 * triggers queued before their CASCADE removed the rows. The TTL and batch size
 * come from the application-owned cleanup configuration.
 *
 * @param dependencies - Message image repository dependency.
 * @returns Use case function that runs one cleanup sweep.
 */
export function cleanupOrphanMessageImages({
  messageImageRepository,
}: CleanupOrphanMessageImagesDependencies) {
  return async (): Promise<CleanupOrphanMessageImagesResult> =>
    messageImageRepository.cleanupOrphanImages({
      abandonedDraftTtlHours: MESSAGE_IMAGE_CLEANUP.abandonedDraftTtlHours,
      batchLimit: MESSAGE_IMAGE_CLEANUP.batchLimit,
      interactiveDeleteGraceMinutes:
        MESSAGE_IMAGE_CLEANUP.interactiveDeleteGraceMinutes,
    });
}
