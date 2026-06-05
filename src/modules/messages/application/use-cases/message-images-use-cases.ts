import type {
  CreateMessageImageUploadCommand,
  DeleteMessageImageCommand,
  MessageImageDeletionResult,
  MessageImageRepository,
  MessageImageUploadCreationResult,
} from "@/src/modules/messages/domain/repositories/message-image-repository";

type CreateMessageImageUploadDependencies = {
  messageImageRepository: MessageImageRepository;
};

type DeleteMessageImageDependencies = {
  messageImageRepository: MessageImageRepository;
};

const MESSAGE_IMAGE_ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Trims a raw alt text into the canonical empty-or-trimmed form persisted for
 * message images.
 *
 * @param altText - Raw alt text coming from the composer payload.
 * @returns The trimmed alt text, or an empty string when absent.
 */
export function normalizeImageAltText(altText: string | null | undefined): string {
  return (altText ?? "").trim();
}

/**
 * Checks whether a value is a valid Cloudflare-backed message image asset id.
 *
 * @param value - Candidate asset id.
 * @returns `true` when the value matches the UUID asset id contract.
 */
export function isMessageImageAssetId(value: string): boolean {
  return MESSAGE_IMAGE_ASSET_ID_PATTERN.test(value);
}

export function createMessageImageUpload({
  messageImageRepository,
}: CreateMessageImageUploadDependencies) {
  return async (
    command: CreateMessageImageUploadCommand
  ): Promise<MessageImageUploadCreationResult> =>
    messageImageRepository.createUpload({
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
    });
}

export function deleteMessageImage({
  messageImageRepository,
}: DeleteMessageImageDependencies) {
  return async (
    command: DeleteMessageImageCommand
  ): Promise<MessageImageDeletionResult> =>
    messageImageRepository.deleteImage({
      assetId: command.assetId.trim(),
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
    });
}
