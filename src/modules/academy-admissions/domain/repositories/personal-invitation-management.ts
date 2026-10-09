/** Defines private leader metadata and one-view issuance independently of SQL, HTTP and recipient eligibility. @module personal-invitation-management */
import type { PersonalInvitation } from "../entities/personal-invitation";
import type { AdmissionContact } from "../value-objects/admission-contact";
import type { AuthorizedAdmissionContext } from "./admission-authorization-reader";
import type { AdmissionOperationResult } from "../entities/admission-operation";

/** Stored/replayed results contain metadata only; initial token material is never part of this contract. */
export type PersonalInvitationMutationResult = { invitationId: string; version: number; changed: boolean; created: boolean };
/** A new successful response may carry one transient token outside the durable original result. */
export type PersonalInvitationCreationResult =
  | { state: "started"; operationId: string; initialToken?: never }
  | { state: "completed"; operationId: string; result: PersonalInvitationMutationResult; replayed: true; initialToken?: never }
  | { state: "completed"; operationId: string; result: PersonalInvitationMutationResult; replayed: false; initialToken?: string };
/** Explicit replacement is bound to the observed existing resource; stale creation cannot revoke another invitation implicitly. */
export type PersonalInvitationReplacement = { invitationId: string; expectedVersion: number };
/** Recipient/restrictions/expiry remain immutable after initial issuance. */
export type PersonalInvitationCreationIntent = {
  context: AuthorizedAdmissionContext; operationId: string; confirmed: true; contact: AdmissionContact;
  internalName: string; requiresAllowlist: boolean; allowlistExemptionAcknowledged: boolean;
  expiresAt?: Date | null; replacement?: PersonalInvitationReplacement;
};
/** Only descriptive metadata may be renamed in place. */
export type PersonalInvitationRenameIntent = { context: AuthorizedAdmissionContext; operationId: string; confirmed: true; invitationId: string; expectedVersion: number; internalName: string };
/** Redeemed authorization withdrawal is a separately confirmed action, never an automatic reinterpretation of stale revocation. */
export type PersonalInvitationRevocationIntent = { context: AuthorizedAdmissionContext; operationId: string; confirmed: true; invitationId: string; expectedVersion: number; revokeRedeemedAuthorization: boolean; internalReason: string };
/** Queries are leader-only and remain inside one tribe; no token lookup is available through administrative history. */
export type PersonalInvitationQuery = { limit: number; status?: PersonalInvitation["status"]; cursor?: { createdAt: string; id: string } };
/** Private current metadata contains no token/hash/key material. */
export type PersonalInvitationPage = { invitations: PersonalInvitation[]; nextCursor: string | null };

/** Reads recheck actual native session and canonical leadership without mutation recency. */
export interface PersonalInvitationReader {
  /** @param context - Native current leader and tribe. @param query - Bounded own filter/cursor. @returns Current private metadata without token recovery or a write. */
  list(context: AuthorizedAdmissionContext, query: PersonalInvitationQuery): Promise<PersonalInvitationPage>;
  /** @param context - Actual leader and exact resource scope. @param invitationId - Own resource identity. @returns Current metadata or absence without disclosing another tribe. */
  read(context: AuthorizedAdmissionContext, invitationId: string): Promise<PersonalInvitation | null>;
}

/** Final writers own leadership/recency, original registry, recipient uniqueness, CAS and related cancellation atomically. */
export interface PersonalInvitationCommandWriter {
  /** @param intent - Explicit canonical issuance/replacement proposal under creation recency. @returns Original metadata; only a newly acknowledged commit may add its transient initial token. */
  create(intent: PersonalInvitationCreationIntent): Promise<PersonalInvitationCreationResult>;
  /** @param intent - Exact name edit with observed version and signed resource recency. @returns One increment or current no-op after replay, without changing recipient or expiry. */
  rename(intent: PersonalInvitationRenameIntent): Promise<AdmissionOperationResult<PersonalInvitationMutationResult>>;
  /** @param intent - Explicit observed state/action, reason and recency. @returns Versioned original result; pending request cancellation must share the same commit. */
  revoke(intent: PersonalInvitationRevocationIntent): Promise<AdmissionOperationResult<PersonalInvitationMutationResult>>;
}
