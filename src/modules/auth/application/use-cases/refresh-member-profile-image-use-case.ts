import type { ExternalProfilePictureProvider } from "@/src/modules/auth/domain/repositories/external-profile-picture-provider";
import type { MemberProfileRepository } from "@/src/modules/auth/domain/repositories/member-profile-repository";
import {
  PROFILE_IMAGE_REFRESH_OUTCOME,
  type ProfileImageRefreshResult,
} from "@/src/modules/auth/application/results/profile-image-refresh-result";

/**
 * Minimal structured logger contract used by this use case. It is structurally
 * compatible with the shared server logger so infrastructure can inject it
 * directly without coupling the application layer to the implementation.
 */
type ProfileImageRefreshLogger = {
  info(input: { message: string; metadata?: Record<string, unknown> }): void;
  error(input: {
    message: string;
    metadata?: Record<string, unknown>;
    error?: unknown;
  }): void;
};

type RefreshMemberProfileImageDependencies = {
  externalProfilePictureProvider: ExternalProfilePictureProvider;
  logger: ProfileImageRefreshLogger;
  memberProfileRepository: MemberProfileRepository;
};

const PROFILE_IMAGE_REFRESH_LOG_MESSAGE = {
  failed: "Failed to refresh member profile image from the identity provider.",
  updated: "Member profile image refreshed from the identity provider.",
} as const;

const RESULT_FAILED: ProfileImageRefreshResult = {
  outcome: PROFILE_IMAGE_REFRESH_OUTCOME.failed,
};
const RESULT_SKIPPED: ProfileImageRefreshResult = {
  outcome: PROFILE_IMAGE_REFRESH_OUTCOME.skipped,
};
const RESULT_UPDATED: ProfileImageRefreshResult = {
  outcome: PROFILE_IMAGE_REFRESH_OUTCOME.updated,
};

/**
 * Extracts a redaction-safe host from an image URL for logging, avoiding
 * leaking the full URL (which may embed provider identifiers).
 *
 * @param imageUrl - The image URL to inspect.
 * @returns The URL host, or `null` when it cannot be parsed.
 */
function extractImageHost(imageUrl: string): string | null {
  try {
    return new URL(imageUrl).host;
  } catch {
    return null;
  }
}

/**
 * Builds the use case that refreshes a member's stored profile image from the
 * external identity provider, persisting it only when it actually changed.
 *
 * Designed to run in the background after a session renewal, so any provider or
 * persistence failure is logged with context and swallowed rather than
 * propagated.
 *
 * @param dependencies - Ports and logger required to perform the refresh.
 * @returns A function that refreshes the image for a given member id.
 */
export function refreshMemberProfileImage({
  externalProfilePictureProvider,
  logger,
  memberProfileRepository,
}: RefreshMemberProfileImageDependencies) {
  return async (userId: string): Promise<ProfileImageRefreshResult> => {
    try {
      const freshImageUrl =
        await externalProfilePictureProvider.getCurrentPictureUrl(userId);

      if (!freshImageUrl) {
        return RESULT_SKIPPED;
      }

      const currentImageUrl = await memberProfileRepository.getImage(userId);

      if (freshImageUrl === currentImageUrl) {
        return RESULT_SKIPPED;
      }

      await memberProfileRepository.updateImage(userId, freshImageUrl);

      logger.info({
        message: PROFILE_IMAGE_REFRESH_LOG_MESSAGE.updated,
        metadata: { imageHost: extractImageHost(freshImageUrl), userId },
      });

      return RESULT_UPDATED;
    } catch (error) {
      logger.error({
        error,
        message: PROFILE_IMAGE_REFRESH_LOG_MESSAGE.failed,
        metadata: { userId },
      });

      return RESULT_FAILED;
    }
  };
}
