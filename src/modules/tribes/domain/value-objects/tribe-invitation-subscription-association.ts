import { TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE } from "@/src/modules/tribes/constants/tribe-invitations";

export type TribeInvitationSubscriptionAssociation =
  | { type: typeof TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current }
  | { type: typeof TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free }
  | {
      type: typeof TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific;
      priceId: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseTribeInvitationSubscriptionAssociation(
  input: unknown
): TribeInvitationSubscriptionAssociation | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as { priceId?: unknown; type?: unknown };

  if (candidate.type === TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current) {
    return { type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current };
  }

  if (candidate.type === TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free) {
    return { type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free };
  }

  if (
    candidate.type === TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific &&
    typeof candidate.priceId === "string" &&
    UUID_PATTERN.test(candidate.priceId)
  ) {
    return {
      priceId: candidate.priceId,
      type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific,
    };
  }

  return null;
}
