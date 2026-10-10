/** Defines own private reads and explicit original administrative mutations for the browser. @module personal-invitation-management-browser-client */
import type { AdmissionErrorCode } from "../../constants/admission-errors";
import type { PersonalInvitationManagementPageState, PersonalInvitationManagementBrowserQuery } from "../results/personal-invitation-management-page-state";
import type { PersonalInvitationManagementIntent } from "../commands/personal-invitation-management-intent";
import type { AdmissionOperationRecoveryDto } from "../results/admission-operation-recovery";
import type { PersonalInvitationMutationResult } from "../../domain/repositories/personal-invitation-management";

export type PersonalInvitationManagementBrowserResult<Value> = { status: "ready"; value: Value } | { status: "failed"; code: AdmissionErrorCode; message: string; uncertain: boolean } | { status: "aborted" };
export type PersonalInvitationManagementOutcome = { state: "started"; operationId: string } | { state: "completed"; operationId: string; replayed: boolean; result: PersonalInvitationMutationResult; invitationUrl?: string };
export interface PersonalInvitationManagementBrowserClient {
  viewer(signal: AbortSignal): Promise<PersonalInvitationManagementBrowserResult<{ id: string } | null>>;
  page(slug: string, query: PersonalInvitationManagementBrowserQuery, signal: AbortSignal): Promise<PersonalInvitationManagementBrowserResult<Extract<PersonalInvitationManagementPageState, { kind: "ready" }>>>;
  write(slug: string, intent: PersonalInvitationManagementIntent, signal: AbortSignal): Promise<PersonalInvitationManagementBrowserResult<{ outcome: PersonalInvitationManagementOutcome; viewerId: string }>>;
  operation(slug: string, operationId: string, signal: AbortSignal): Promise<PersonalInvitationManagementBrowserResult<{ original: AdmissionOperationRecoveryDto; viewerId: string }>>;
}
