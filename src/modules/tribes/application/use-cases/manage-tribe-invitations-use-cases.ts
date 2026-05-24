import { randomBytes, randomUUID } from "crypto";

import type {
  AcceptTribeInvitationCommand,
  CreateTribeInvitationCommand,
  GetTribeInvitationSubscriptionOfferQuery,
  ListTribeInvitationsQuery,
  RevokeTribeInvitationCommand,
  TribeInvitationRepository,
} from "@/src/modules/tribes/domain/repositories/tribe-invitation-repository";

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

export function createTribeInvitation({
  tribeInvitationRepository,
}: TribeInvitationDependencies) {
  return async (command: Omit<CreateTribeInvitationCommand, "invitationId" | "token">) => {
    const invitationId = createInvitationId();

    return tribeInvitationRepository.create({
      baseUrl: command.baseUrl,
      invitationId,
      token: createInvitationToken(),
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
