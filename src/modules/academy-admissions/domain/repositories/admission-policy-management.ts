/** Defines current-policy reads and original explicit commands independently of SQL/providers. @module admission-policy-management */
import type { AdmissionPolicy, AdmissionPolicyPatch } from "../entities/admission-policy";
import type { AuthorizedAdmissionContext } from "./admission-authorization-reader";
import type { AdmissionOperationResult } from "../entities/admission-operation";
import type { AdmissionMessagingUsagePolicy } from "./messaging-usage-policy-reader";
import type { AdmissionPolicyActivationFacts } from "../policies/admission-policy-activation";

/** Absence has no version; a policy read never initializes or activates the resource. */
export type AdmissionPolicyState = { policy: AdmissionPolicy | null; controlActivated: boolean; usage: AdmissionMessagingUsagePolicy | null };
/** Counts and preparation are current private owner projections for an informational leader query. */
export type AdmissionPolicyViewFacts = { pendingRequestCount: number; preparation: Omit<AdmissionPolicyActivationFacts, "now"> | null };
export interface AdmissionPolicyViewFactsReader {
  /** @param context - Current leader scope without mutation recency. @param policy - Current stored policy or true absence. @returns Current impact and evaluated preparation, or explicit unevaluated preparation. */
  read(context: AuthorizedAdmissionContext, policy: AdmissionPolicy | null): Promise<AdmissionPolicyViewFacts>;
}
/** A completed outcome is the original commit, not proof of the current public view. */
export type AdmissionPolicyMutationResult = { policyId: string; version: number; verificationEpoch: number; activatedAt: string | null; controlActivated: boolean; changed: boolean };
/** A transaction-bound owner supplies live preparation; absence never grants readiness. */
export interface AdmissionPolicyPreparationReader {
  /** @param policy - Current proposed policy. @returns Locked preparation facts whose clock is resampled by the actual writer. */
  read(policy: AdmissionPolicy): Promise<Omit<AdmissionPolicyActivationFacts, "now">>;
}
export type AdmissionPolicyInitializationIntent = { context: AuthorizedAdmissionContext; operationId: string; confirmed: true; type: "initialize_admission_policy" };
export type AdmissionPolicyUpdateIntent = { context: AuthorizedAdmissionContext; operationId: string; confirmed: true; type: "update_admission_policy"; expectedVersion: number; patch: AdmissionPolicyPatch };
export type AdmissionPolicyActivationIntent = { context: AuthorizedAdmissionContext; operationId: string; confirmed: true; type: "activate_admission_policy"; expectedVersion: number };
export type AdmissionPolicyPauseIntent = { context: AuthorizedAdmissionContext; operationId: string; confirmed: true; type: "pause_admission_policy"; expectedVersion: number; reason: string };

export interface AdmissionPolicyStateReader {
  read(context: AuthorizedAdmissionContext): Promise<AdmissionPolicyState>;
}

/** Writers revalidate leader/session/recency, preparation and final clock inside one original-ledger transaction. */
export interface AdmissionPolicyCommandWriter {
  initialize(intent: AdmissionPolicyInitializationIntent): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>>;
  update(intent: AdmissionPolicyUpdateIntent): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>>;
  activate(intent: AdmissionPolicyActivationIntent): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>>;
  pause(intent: AdmissionPolicyPauseIntent): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>>;
}
