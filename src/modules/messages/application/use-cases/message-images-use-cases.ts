import type { MessageImageDraftCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import {
  MESSAGE_IMAGES,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import type {
  CreateMessageImageUploadCommand,
  DeleteMessageImageCommand,
  MessageImageAttachmentDraft,
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

const NORMALIZED_MESSAGE_IMAGES_STATUS = {
  valid: "valid",
} as const;

const MESSAGE_IMAGE_ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NormalizedMessageImagesResult =
  | {
      images: MessageImageAttachmentDraft[];
      status: typeof NORMALIZED_MESSAGE_IMAGES_STATUS.valid;
    }
  | {
      status: typeof MESSAGE_MUTATION_STATUS.invalidImage;
    };

function normalizeImageAltText(altText: string | null | undefined): string {
  return (altText ?? "").trim();
}

function isMessageImageAssetId(value: string): boolean {
  return MESSAGE_IMAGE_ASSET_ID_PATTERN.test(value);
}

export function normalizeMessageImageDrafts(
  images: MessageImageDraftCommand[] | null | undefined
): NormalizedMessageImagesResult {
  if (!images || images.length === 0) {
    return { images: [], status: NORMALIZED_MESSAGE_IMAGES_STATUS.valid };
  }

  if (images.length > MESSAGE_IMAGES.maxCount) {
    return { status: MESSAGE_MUTATION_STATUS.invalidImage };
  }

  const assetIds = new Set<string>();
  const normalizedImages: MessageImageAttachmentDraft[] = [];

  for (const image of images) {
    const assetId = image.assetId.trim();
    const altText = normalizeImageAltText(image.altText);

    if (
      !isMessageImageAssetId(assetId) ||
      assetIds.has(assetId) ||
      altText.length > MESSAGE_IMAGES.maxAltTextLength
    ) {
      return { status: MESSAGE_MUTATION_STATUS.invalidImage };
    }

    assetIds.add(assetId);
    normalizedImages.push({
      altText,
      assetId,
      sortOrder: normalizedImages.length,
    });
  }

  return { images: normalizedImages, status: NORMALIZED_MESSAGE_IMAGES_STATUS.valid };
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
