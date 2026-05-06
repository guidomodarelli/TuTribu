import type {
  TribeInvitationAcceptanceResult,
  TribeInvitationCreationResult,
  TribeInvitationListItemResult,
  TribeInvitationRevocationResult,
} from "@/src/modules/tribes/application/results/tribe-invitation-result";

export type CreateTribeInvitationCommand = {
  baseUrl: string;
  invitationId: string;
  token: string;
  tribeSlug: string;
};

export type ListTribeInvitationsQuery = {
  tribeSlug: string;
};

export type AcceptTribeInvitationCommand = {
  token: string;
  tribeSlug: string;
};

export type RevokeTribeInvitationCommand = {
  invitationId: string;
  tribeSlug: string;
};

export type TribeInvitationRepository = {
  accept(command: AcceptTribeInvitationCommand): Promise<TribeInvitationAcceptanceResult>;
  create(command: CreateTribeInvitationCommand): Promise<TribeInvitationCreationResult>;
  listByTribeSlug(query: ListTribeInvitationsQuery): Promise<TribeInvitationListItemResult[]>;
  revoke(command: RevokeTribeInvitationCommand): Promise<TribeInvitationRevocationResult>;
};
