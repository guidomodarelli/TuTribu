const URL_PROTOCOL = {
  http: "http:",
  https: "https:",
} as const;

const INVALID_MEETING_URL_MESSAGE_PREFIX = "Invalid external meeting URL: ";
const INVALID_MEETING_URL_ERROR_NAME = "InvalidMeetingUrlError";

export class InvalidMeetingUrlError extends Error {
  constructor(rawUrl: string) {
    super(INVALID_MEETING_URL_MESSAGE_PREFIX + rawUrl);
    this.name = INVALID_MEETING_URL_ERROR_NAME;
  }
}

/**
 * Normalizes optional external meeting links and rejects non-browser protocols.
 */
export function normalizeExternalMeetingUrl(
  rawUrl: string | null | undefined
): string | null {
  const trimmedUrl = rawUrl?.trim() ?? "";

  if (!trimmedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);

    if (
      parsedUrl.protocol !== URL_PROTOCOL.http &&
      parsedUrl.protocol !== URL_PROTOCOL.https
    ) {
      throw new InvalidMeetingUrlError(trimmedUrl);
    }

    return trimmedUrl;
  } catch (error) {
    if (error instanceof InvalidMeetingUrlError) {
      throw error;
    }

    throw new InvalidMeetingUrlError(trimmedUrl);
  }
}
