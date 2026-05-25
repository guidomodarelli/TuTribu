import { randomBytes, randomUUID } from "crypto";

import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import type {
  AcceptTribeInvitationCommand,
  CreateTribeInvitationCommand,
  GetTribeInvitationSubscriptionOfferQuery,
  ListTribeInvitationsByPriceQuery,
  ListTribeInvitationsQuery,
  RevokeTribeInvitationCommand,
  TribeInvitationRepository,
  UpdateTribeInvitationSubscriptionAssociationCommand,
} from "@/src/modules/tribes/domain/repositories/tribe-invitation-repository";
import { parseTribeInvitationSubscriptionAssociation } from "@/src/modules/tribes/domain/value-objects/tribe-invitation-subscription-association";

type TribeInvitationDependencies = {
  tribeInvitationRepository: TribeInvitationRepository;
};

const INVITATION_TOKEN_BYTE_LENGTH = 32;
const INVITATION_TOKEN_ENCODING = "base64url";

function createInvitationId(): string {
  return randomUUID();
}

function createInvitationToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTE_LENGTH).toString(
    INVITATION_TOKEN_ENCODING
  );
}

export function listTribeInvitations({
  tribeInvitationRepository,
}: TribeInvitationDependencies) {
  return async (query: ListTribeInvitationsQuery) =>
    tribeInvitationRepository.listByTribeSlug({
      baseUrl: query.baseUrl,
      tribeSlug: query.tribeSlug.trim(),
    });
}

export function listTribeInvitationsByPrice({
  tribeInvitationRepository,
}: TribeInvitationDependencies) {
  return async (query: ListTribeInvitationsByPriceQuery) =>
    tribeInvitationRepository.listByPriceId({
      baseUrl: query.baseUrl,
      priceId: query.priceId.trim(),
      tribeSlug: query.tribeSlug.trim(),
    });
}

export function createTribeInvitation({
  tribeInvitationRepository,
}: TribeInvitationDependencies) {
  return async (
    command: Omit<CreateTribeInvitationCommand, "invitationId" | "token" | "subscriptionAssociation"> & {
      subscriptionAssociation: unknown;
    }
  ) => {
    const subscriptionAssociation = parseTribeInvitationSubscriptionAssociation(
      command.subscriptionAssociation
    );

    if (!subscriptionAssociation) {
      return { status: TRIBE_INVITATION_STATUS.invalid } as const;
    }

    const invitationId = createInvitationId();

    return tribeInvitationRepository.create({
      baseUrl: command.baseUrl,
      invitationId,
      subscriptionAssociation,
      token: createInvitationToken(),
      tribeSlug: command.tribeSlug.trim(),
    });
  };
}

export function updateTribeInvitationSubscriptionAssociation({
  tribeInvitationRepository,
}: TribeInvitationDependencies) {
  return async (
    command: Omit<UpdateTribeInvitationSubscriptionAssociationCommand, "subscriptionAssociation"> & {
      subscriptionAssociation: unknown;
    }
  ) => {
    const subscriptionAssociation = parseTribeInvitationSubscriptionAssociation(
      command.subscriptionAssociation
    );

    if (!subscriptionAssociation) {
      return { status: TRIBE_INVITATION_STATUS.invalid } as const;
    }

    return tribeInvitationRepository.updateSubscriptionAssociation({
      baseUrl: command.baseUrl,
      invitationId: command.invitationId.trim(),
      subscriptionAssociation,
      tribeSlug: command.tribeSlug.trim(),
    });
  };
}

export function revokeTribeInvitation({
  tribeInvitationRepository,
}: TribeInvitationDependencies) {
  return async (command: RevokeTribeInvitationCommand) =>
    tribeInvitationRepository.revoke({
      invitationId: command.invitationId.trim(),
      tribeSlug: command.tribeSlug.trim(),
    });
}

export function acceptTribeInvitation({
  tribeInvitationRepository,
}: TribeInvitationDependencies) {
  return async (command: AcceptTribeInvitationCommand) =>
    tribeInvitationRepository.accept({
      token: command.token.trim(),
      tribeSlug: command.tribeSlug.trim(),
    });
}

export function getTribeInvitationSubscriptionOffer({
  tribeInvitationRepository,
}: TribeInvitationDependencies) {
  return async (query: GetTribeInvitationSubscriptionOfferQuery) =>
    tribeInvitationRepository.getSubscriptionOffer({
      token: query.token.trim(),
      tribeSlug: query.tribeSlug.trim(),
    });
}
