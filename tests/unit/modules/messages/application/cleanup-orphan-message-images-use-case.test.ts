import { cleanupOrphanMessageImages } from "@/src/modules/messages/application/use-cases/cleanup-orphan-message-images-use-case";
import { MESSAGE_IMAGE_CLEANUP } from "@/src/modules/messages/constants/message-round";

describe("cleanupOrphanMessageImages", () => {
  it("runs the sweep with the configured TTL, batch size, and interactive delete grace and returns its result", async () => {
    const sweepResult = {
      reclaimedDrafts: 3,
      remoteDeletedPending: 2,
      remoteDeletedQueued: 1,
      remoteFailures: 0,
    };
    const cleanupOrphanImages = jest.fn(async () => sweepResult);
    const execute = cleanupOrphanMessageImages({
      messageImageRepository: { cleanupOrphanImages },
    });

    await expect(execute()).resolves.toEqual(sweepResult);

    expect(cleanupOrphanImages).toHaveBeenCalledWith({
      abandonedDraftTtlHours: MESSAGE_IMAGE_CLEANUP.abandonedDraftTtlHours,
      batchLimit: MESSAGE_IMAGE_CLEANUP.batchLimit,
      interactiveDeleteGraceMinutes:
        MESSAGE_IMAGE_CLEANUP.interactiveDeleteGraceMinutes,
    });
  });
});
