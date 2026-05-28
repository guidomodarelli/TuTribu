import { TRIBE_INVITATION_CHANNEL } from "@/src/modules/tribes/constants/tribe-invitations";

export type TribeInvitationChannel =
  (typeof TRIBE_INVITATION_CHANNEL)[keyof typeof TRIBE_INVITATION_CHANNEL];

export type TribeInvitationReferralMetadata = {
  campaignName: string | null;
  channel: TribeInvitationChannel | null;
  referrerHandle: string | null;
};

const REFERRAL_METADATA_LIMIT = {
  campaignNameMaxLength: 80,
  referrerHandleMaxLength: 80,
} as const;

const REFERRER_HANDLE_PATTERN = /^@?[A-Za-z0-9._-]+$/;

const TRIBE_INVITATION_CHANNEL_VALUES = new Set<string>(
  Object.values(TRIBE_INVITATION_CHANNEL)
);

/**
 * Checks whether a raw optional metadata value can safely cross into the domain.
 *
 * @param input - Raw value received from an external command payload.
 * @returns Whether the value is absent, null, or a string that can be normalized.
 */
function isOptionalTextInput(input: unknown): input is string | null | undefined {
  if (input === null || input === undefined) {
    return true;
  }

  return typeof input === "string";
}

/**
 * Normalizes an optional referral metadata text field.
 *
 * @param input - Optional text value already validated as a text-compatible input.
 * @returns Trimmed text, or null when the field is absent or blank.
 */
function normalizeOptionalText(input: string | null | undefined): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  const trimmedValue = input.trim();

  return trimmedValue || null;
}

/**
 * Parses a raw invitation channel into the supported referral channel set.
 *
 * @param input - Raw channel value received from command payloads.
 * @returns Normalized invitation channel, or null when absent or unsupported.
 */
export function parseTribeInvitationChannel(
  input: unknown
): TribeInvitationChannel | null {
  if (!isOptionalTextInput(input)) {
    return null;
  }

  const normalizedValue = normalizeOptionalText(input)?.toLowerCase() ?? null;

  if (!normalizedValue) {
    return null;
  }

  return TRIBE_INVITATION_CHANNEL_VALUES.has(normalizedValue)
    ? (normalizedValue as TribeInvitationChannel)
    : null;
}

/**
 * Parses and validates optional referral metadata for invitation reporting.
 *
 * @param input - Raw referral metadata fields received from command payloads.
 * @returns Normalized referral metadata, or null when any provided field is malformed.
 */
export function parseTribeInvitationReferralMetadata(input: {
  campaignName?: unknown;
  channel?: unknown;
  referrerHandle?: unknown;
}): TribeInvitationReferralMetadata | null {
  if (
    !isOptionalTextInput(input.campaignName) ||
    !isOptionalTextInput(input.channel) ||
    !isOptionalTextInput(input.referrerHandle)
  ) {
    return null;
  }

  const channel = parseTribeInvitationChannel(input.channel);
  const rawChannel = normalizeOptionalText(input.channel);

  if (rawChannel && !channel) {
    return null;
  }

  const campaignName = normalizeOptionalText(input.campaignName);

  if (
    campaignName &&
    campaignName.length > REFERRAL_METADATA_LIMIT.campaignNameMaxLength
  ) {
    return null;
  }

  const referrerHandle = normalizeOptionalText(input.referrerHandle);

  if (
    referrerHandle &&
    (referrerHandle.length > REFERRAL_METADATA_LIMIT.referrerHandleMaxLength ||
      !REFERRER_HANDLE_PATTERN.test(referrerHandle))
  ) {
    return null;
  }

  return {
    campaignName,
    channel,
    referrerHandle,
  };
}
