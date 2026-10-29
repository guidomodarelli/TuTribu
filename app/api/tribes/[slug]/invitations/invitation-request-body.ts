/**
 * Readers of the invitation request bodies shared by the invitation route
 * handlers (the use cases validate the values).
 *
 * @module invitation-request-body
 */

const INVITATION_REFERRAL_FIELD = {
  campaignName: "campaignName",
  channel: "channel",
  referrerHandle: "referrerHandle",
} as const;

/**
 * Reads the referral metadata (campaign, channel and referrer) of an
 * invitation body.
 *
 * @param body - Parsed JSON body.
 * @returns The raw values, `undefined` when the body is not an object.
 */
export function readInvitationReferralMetadata(body: unknown): {
  campaignName: unknown;
  channel: unknown;
  referrerHandle: unknown;
} {
  if (!body || typeof body !== "object") {
    return {
      campaignName: undefined,
      channel: undefined,
      referrerHandle: undefined,
    };
  }

  const bodyRecord = body as Record<string, unknown>;

  return {
    campaignName: bodyRecord[INVITATION_REFERRAL_FIELD.campaignName],
    channel: bodyRecord[INVITATION_REFERRAL_FIELD.channel],
    referrerHandle: bodyRecord[INVITATION_REFERRAL_FIELD.referrerHandle],
  };
}
