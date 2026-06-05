import type { MessageMediaDraftCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import {
  MESSAGE_IMAGES,
  MESSAGE_MEDIA,
  MESSAGE_MEDIA_KIND,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import type { MessageImageAttachmentDraft } from "@/src/modules/messages/domain/repositories/message-image-repository";
import type { MessageVideoRepositoryDraft } from "@/src/modules/messages/domain/repositories/message-creation-repository";
import {
  isMessageImageAssetId,
  normalizeImageAltText,
} from "@/src/modules/messages/application/use-cases/message-images-use-cases";
import {
  InvalidVideoUrlError,
  type ParsedExternalVideo,
  parseExternalVideoUrl,
} from "@/src/modules/shared/domain/value-objects/external-video-url";

export const NORMALIZED_MESSAGE_MEDIA_STATUS = {
  valid: "valid",
} as const;

/**
 * Outcome of normalizing the unified media list. On success it exposes the
 * image and video drafts already tagged with their global `sortOrder` slot; on
 * failure it reports the most specific media error.
 */
export type NormalizedMessageMediaResult =
  | {
      images: MessageImageAttachmentDraft[];
      status: typeof NORMALIZED_MESSAGE_MEDIA_STATUS.valid;
      videos: MessageVideoRepositoryDraft[];
    }
  | {
      status:
        | typeof MESSAGE_MUTATION_STATUS.invalidImage
        | typeof MESSAGE_MUTATION_STATUS.invalidMedia
        | typeof MESSAGE_MUTATION_STATUS.invalidVideoUrl;
    };

function parseMediaVideo(rawUrl: string): ParsedExternalVideo | null {
  try {
    return parseExternalVideoUrl(rawUrl);
  } catch (error) {
    if (error instanceof InvalidVideoUrlError) {
      return null;
    }
    throw error;
  }
}

/**
 * Validates the composer's ordered media list and splits it into image and
 * video drafts that share one global `sortOrder` slot space.
 *
 * The array index of each media item becomes its `sortOrder`, so the unified
 * gallery can later be rebuilt in the exact order the author arranged it. The
 * combined count of images and videos must stay within {@link MESSAGE_MEDIA}.
 *
 * @param media - Ordered media drafts submitted by the composer.
 * @returns Normalized images and videos, or the most specific media error.
 */
export function normalizeMessageMediaDrafts(
  media: MessageMediaDraftCommand[] | null | undefined
): NormalizedMessageMediaResult {
  if (!media || media.length === 0) {
    return {
      images: [],
      status: NORMALIZED_MESSAGE_MEDIA_STATUS.valid,
      videos: [],
    };
  }

  if (media.length > MESSAGE_MEDIA.maxCount) {
    return { status: MESSAGE_MUTATION_STATUS.invalidMedia };
  }

  const assetIds = new Set<string>();
  const images: MessageImageAttachmentDraft[] = [];
  const videos: MessageVideoRepositoryDraft[] = [];

  for (let slot = 0; slot < media.length; slot += 1) {
    const item = media[slot];

    if (item.kind === MESSAGE_MEDIA_KIND.image) {
      const assetId = item.assetId.trim();
      const altText = normalizeImageAltText(item.altText);

      if (
        !isMessageImageAssetId(assetId) ||
        assetIds.has(assetId) ||
        altText.length > MESSAGE_IMAGES.maxAltTextLength
      ) {
        return { status: MESSAGE_MUTATION_STATUS.invalidImage };
      }

      assetIds.add(assetId);
      images.push({ altText, assetId, sortOrder: slot });
      continue;
    }

    const parsedVideo = parseMediaVideo(item.url);
    if (!parsedVideo) {
      return { status: MESSAGE_MUTATION_STATUS.invalidVideoUrl };
    }

    videos.push({
      externalId: parsedVideo.externalId,
      provider: parsedVideo.provider,
      sortOrder: slot,
    });
  }

  return {
    images,
    status: NORMALIZED_MESSAGE_MEDIA_STATUS.valid,
    videos,
  };
}
