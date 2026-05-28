import type {
  TribeInvitationAcceptanceResult,
  TribeInvitationCreationResult,
  TribeInvitationConversionMetricResult,
  TribeInvitationListItemResult,
  TribeInvitationReferralMetadataUpdateResult,
  TribeInvitationRevocationResult,
  TribeInvitationSubscriptionAssociationUpdateResult,
  TribeInvitationSubscriptionOfferResult,
  TribeInvitationsByPriceResult,
} from "@/src/modules/tribes/application/results/tribe-invitation-result";
import type { TribeInvitationSubscriptionAssociation } from "@/src/modules/tribes/domain/value-objects/tribe-invitation-subscription-association";
import type { TribeInvitationReferralMetadata } from "@/src/modules/tribes/domain/value-objects/tribe-invitation-referral-metadata";

export type CreateTribeInvitationCommand = {
  baseUrl: string;
  invitationId: string;
  referralMetadata: TribeInvitationReferralMetadata;
  subscriptionAssociation: TribeInvitationSubscriptionAssociation;
  token: string;
  tribeSlug: string;
};

export type ListTribeInvitationsQuery = {
  baseUrl: string;
  tribeSlug: string;
};

export type AcceptTribeInvitationCommand = {
  token: string;
  tribeSlug: string;
};

export type GetTribeInvitationSubscriptionOfferQuery = {
  token: string;
  tribeSlug: string;
};

export type RevokeTribeInvitationCommand = {
  invitationId: string;
  tribeSlug: string;
};

export type UpdateTribeInvitationSubscriptionAssociationCommand = {
  baseUrl: string;
  invitationId: string;
  subscriptionAssociation: TribeInvitationSubscriptionAssociation;
  tribeSlug: string;
};

export type UpdateTribeInvitationReferralMetadataCommand = {
  baseUrl: string;
  invitationId: string;
  referralMetadata: TribeInvitationReferralMetadata;
  tribeSlug: string;
};

export type GetTribeInvitationConversionMetricsQuery = {
  tribeSlug: string;
};

export type ListTribeInvitationsByPriceQuery = {
  baseUrl: string;
  priceId: string;
  tribeSlug: string;
};

export type TribeInvitationRepository = {
  accept(command: AcceptTribeInvitationCommand): Promise<TribeInvitationAcceptanceResult>;
  create(command: CreateTribeInvitationCommand): Promise<TribeInvitationCreationResult>;
  getSubscriptionOffer(
    query: GetTribeInvitationSubscriptionOfferQuery
  ): Promise<TribeInvitationSubscriptionOfferResult>;
  getConversionMetrics(
    query: GetTribeInvitationConversionMetricsQuery
  ): Promise<TribeInvitationConversionMetricResult[]>;
  listByPriceId(
    query: ListTribeInvitationsByPriceQuery
  ): Promise<TribeInvitationsByPriceResult>;
  listByTribeSlug(query: ListTribeInvitationsQuery): Promise<TribeInvitationListItemResult[]>;
  revoke(command: RevokeTribeInvitationCommand): Promise<TribeInvitationRevocationResult>;
  updateSubscriptionAssociation(
    command: UpdateTribeInvitationSubscriptionAssociationCommand
  ): Promise<TribeInvitationSubscriptionAssociationUpdateResult>;
  updateReferralMetadata(
    command: UpdateTribeInvitationReferralMetadataCommand
  ): Promise<TribeInvitationReferralMetadataUpdateResult>;
};
