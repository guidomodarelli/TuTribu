import type {
  TRIBE_INVITATION_STATUS,
  TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS,
} from "@/src/modules/tribes/constants/tribe-invitations";

export type TribeInvitationListItemResult = {
  createdAt: string;
  createdByName: string | null;
  id: string;
  invitationUrl: string | null;
};

export type TribeInvitationCreationResult =
  | {
      invitation: TribeInvitationListItemResult;
      invitationUrl: string;
      status: typeof TRIBE_INVITATION_STATUS.created;
    }
  | {
      status:
        | typeof TRIBE_INVITATION_STATUS.forbidden
        | typeof TRIBE_INVITATION_STATUS.notFound
        | typeof TRIBE_INVITATION_STATUS.setupRequired;
    };

export type TribeInvitationRevocationResult = {
  status:
    | typeof TRIBE_INVITATION_STATUS.revoked
    | typeof TRIBE_INVITATION_STATUS.forbidden
    | typeof TRIBE_INVITATION_STATUS.notFound;
};

export type TribeInvitationAcceptanceResult = {
  status:
    | typeof TRIBE_INVITATION_STATUS.accepted
    | typeof TRIBE_INVITATION_STATUS.blocked
    | typeof TRIBE_INVITATION_STATUS.invalid
    | typeof TRIBE_INVITATION_STATUS.revoked
    | typeof TRIBE_INVITATION_STATUS.subscriptionRequired;
};

export type TribeInvitationSubscriptionOfferPriceResult = {
  amountCents: number;
  currency: string;
  frequency: string;
  name: string;
};

export type TribeInvitationSubscriptionOfferResult =
  | {
      price: TribeInvitationSubscriptionOfferPriceResult;
      status: typeof TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS.available;
    }
  | {
      status: typeof TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS.unavailable;
    };
