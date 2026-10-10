/** Owns browser contact operations without provider DTOs, browser authority or credential fields. @module admission-contact-browser-client */
import type { AdmissionErrorCode, AdmissionErrorOperation } from "../results/admission-errors";
import type { AdmissionOperationResult } from "../../domain/entities/admission-operation";
import type { AdmissionChallengeSnapshot, AdmissionChallengeVerificationSnapshot } from "../../domain/repositories/admission-contact-verification";
import type { AdmissionProofApplicationResult } from "../../domain/repositories/admission-verification-proof-repository";
import type { AdmissionCurrentChallengeSelection } from "../../domain/repositories/admission-current-challenge-reader";
import type { AdmissionOperationRecoveryDto } from "../results/admission-operation-recovery";
import type { z } from "zod";
import type { messageDeliverySchema } from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";

/** Transport uncertainty does not manufacture a registered operation; progress appears only from a guarded own response. */
export type AdmissionContactBrowserResult<Value> = { status: "ready"; value: Value } | { status: "failed"; code: AdmissionErrorCode; message: string; uncertain: boolean; operation?: AdmissionErrorOperation } | { status: "aborted" };
/** Original UUID and explicit confirmation precede each proposed contact action. */
export type AdmissionContactIssue = { operationId: string; confirmed: true; expectedPolicyVersion: number; channel: "email" | "sms" | "whatsapp"; phone?: string; country?: string; requestId?: string; invitationToken?: string; legacyInvitationToken?: string };
/** Code stays in memory and the exact request body; it is not durable draft metadata. */
export type AdmissionContactVerify = { operationId: string; confirmed: true; verificationCode: string };
/** SMS alternative is explicit and always keeps the server-owned recipient. */
export type AdmissionContactResend = { operationId: string; confirmed: true; useSmsAlternative?: true };
/** Proof is opaque and must match the original pending/version. */
export type AdmissionContactApply = { operationId: string; confirmed: true; expectedVersion: number; proofId: string };
/** A readonly exact-contact proposal precedes an explicit choice to replace a prior code. */
export type AdmissionContactSelectionInput = { previousRequestId: string; expectedPolicyVersion: number; channel: "email" | "sms" | "whatsapp"; phone?: string; country?: string };
/** Only a guarded local verification can expose an available proof. */
export type AdmissionContactVerified = Extract<AdmissionChallengeVerificationSnapshot, { result: "verified" }>;
/** Contact transport belongs in the route container/hook, never the presenter. */
export interface AdmissionContactBrowserClient {
  current(slug: string, input: AdmissionContactSelectionInput, signal: AbortSignal): Promise<AdmissionContactBrowserResult<AdmissionCurrentChallengeSelection>>;
  issue(slug: string, input: AdmissionContactIssue, signal: AbortSignal): Promise<AdmissionContactBrowserResult<AdmissionOperationResult<AdmissionChallengeSnapshot>>>;
  verify(slug: string, challengeId: string, input: AdmissionContactVerify, signal: AbortSignal): Promise<AdmissionContactBrowserResult<AdmissionOperationResult<AdmissionContactVerified>>>;
  resend(slug: string, challengeId: string, input: AdmissionContactResend, signal: AbortSignal): Promise<AdmissionContactBrowserResult<AdmissionOperationResult<AdmissionChallengeSnapshot>>>;
  apply(slug: string, requestId: string, input: AdmissionContactApply, signal: AbortSignal): Promise<AdmissionContactBrowserResult<AdmissionOperationResult<Extract<AdmissionProofApplicationResult, { outcome: "applied" }>>>>;
  operation(slug: string, operationId: string, signal: AbortSignal): Promise<AdmissionContactBrowserResult<AdmissionOperationRecoveryDto>>;
  delivery(slug: string, deliveryId: string, signal: AbortSignal): Promise<AdmissionContactBrowserResult<z.infer<typeof messageDeliverySchema>>>;
}
