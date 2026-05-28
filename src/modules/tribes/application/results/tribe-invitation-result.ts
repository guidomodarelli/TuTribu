import type {
  TRIBE_INVITATION_STATUS,
  TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE,
  TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS,
} from "@/src/modules/tribes/constants/tribe-invitations";

export type TribeInvitationAssociatedPlanTrialResult = {
  frequency: number;
  frequencyType: "days" | "months";
};

export type TribeInvitationAssociatedPlanResult = {
  amountCents: number;
  currency: string;
  frequency: string;
  id: string;
  mercadoPagoAccountEmail: string | null;
  mercadoPagoAccountLabel: string | null;
  name: string;
  status: "active" | "canceled" | "deleted";
  trial: TribeInvitationAssociatedPlanTrialResult | null;
};

export type TribeInvitationSubscriptionAssociationResult =
  | {
      type:
        | typeof TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current
        | typeof TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free;
    }
  | {
      plan: TribeInvitationAssociatedPlanResult | null;
      priceId: string;
      type: typeof TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific;
    };

export type TribeInvitationListItemResult = {
  createdAt: string;
  createdByName: string | null;
  id: string;
  invitationUrl: string | null;
  subscriptionAssociation: TribeInvitationSubscriptionAssociationResult;
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
        | typeof TRIBE_INVITATION_STATUS.invalid
        | typeof TRIBE_INVITATION_STATUS.notFound
        | typeof TRIBE_INVITATION_STATUS.setupRequired;
    };

export type TribeInvitationRevocationResult = {
  status:
    | typeof TRIBE_INVITATION_STATUS.revoked
    | typeof TRIBE_INVITATION_STATUS.forbidden
    | typeof TRIBE_INVITATION_STATUS.notFound;
};

export type TribeInvitationSubscriptionAssociationUpdateResult =
  | {
      invitation: TribeInvitationListItemResult;
      status: typeof TRIBE_INVITATION_STATUS.updated;
    }
  | {
      status:
        | typeof TRIBE_INVITATION_STATUS.forbidden
        | typeof TRIBE_INVITATION_STATUS.invalid
        | typeof TRIBE_INVITATION_STATUS.notFound;
    };

export type TribeInvitationsByPriceResult = {
  invitations: TribeInvitationListItemResult[];
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
