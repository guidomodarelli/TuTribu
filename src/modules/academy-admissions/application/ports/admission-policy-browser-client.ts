/** Owns policy browser reads/commands without provider DTOs or permission booleans from the client. @module admission-policy-browser-client */
import type { z } from "zod";
import type { AdmissionBrowserResult, AdmissionBrowserClient } from "./admission-browser-client";
import type { AdmissionPolicyStateDto } from "../results/admission-policy-result-schemas";
import type { admissionPreflightResultSchema } from "../results/admission-preflight-result-schema";
import type { AdmissionPolicyDraft } from "../commands/admission-policy-draft";
import type { AdmissionOperationResult } from "../../domain/entities/admission-operation";
import type { AdmissionPolicyMutationResult } from "../../domain/repositories/admission-policy-management";

export type AdmissionPolicyConfirmation = { operationId: string; confirmed: true };
export type AdmissionPolicyVersionedConfirmation = AdmissionPolicyConfirmation & { expectedVersion: number };
export type AdmissionPolicyPreflightDto = z.infer<typeof admissionPreflightResultSchema>;
export interface AdmissionPolicyBrowserClient extends Pick<AdmissionBrowserClient, "viewer" | "operation"> {
  readPolicy(slug: string, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionPolicyStateDto>>;
  readPreflight(slug: string, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionPolicyPreflightDto>>;
  initializePolicy(slug: string, input: AdmissionPolicyConfirmation, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionOperationResult<AdmissionPolicyMutationResult>>>;
  updatePolicy(slug: string, input: AdmissionPolicyVersionedConfirmation & AdmissionPolicyDraft, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionOperationResult<AdmissionPolicyMutationResult>>>;
  activatePolicy(slug: string, input: AdmissionPolicyVersionedConfirmation, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionOperationResult<AdmissionPolicyMutationResult>>>;
  pausePolicy(slug: string, input: AdmissionPolicyVersionedConfirmation & { reason: string }, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionOperationResult<AdmissionPolicyMutationResult>>>;
}
