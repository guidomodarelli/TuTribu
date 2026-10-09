"use client";
/** Consumes only own same-origin contact contracts, preserving original uncertainty and cancellation without automatic retries. @module admission-contact-api-client */
import { z } from "zod";
import type { AdmissionContactBrowserClient, AdmissionContactBrowserResult } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import type { AdmissionErrorCode, AdmissionErrorOperation } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionChallengeSnapshotSchema, admissionVerifiedContactSchema } from "@/src/modules/academy-admissions/application/results/admission-contact-verification-schemas";
import { admissionProofApplicationSnapshotSchema } from "@/src/modules/academy-admissions/application/results/admission-proof-application-schemas";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_CONTACT_BROWSER_PATH, ADMISSION_CONTACT_BROWSER_STATUS } from "@/src/modules/academy-admissions/constants/admission-contact-browser";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { messageDeliverySchema } from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";
import { messagingPublicErrorSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";

/** @param options - Explicit own HTTP boundary for testing; default transport is native fetch. @returns Guarded contact ports without viewer lookups, SDK or a provider dependency. */
export function createAdmissionContactApiClient(options: { fetch?: typeof globalThis.fetch } = {}): AdmissionContactBrowserClient {
  const transport = options.fetch ?? globalThis.fetch;
  /** @param code - Closed own error. @param uncertain - Whether the write may have committed. @param operation - Genuine guarded original metadata only. @returns Safe catalogue copy with no raw upstream diagnostics. */
  const failed = (code: AdmissionErrorCode, uncertain: boolean, operation?: AdmissionErrorOperation): AdmissionContactBrowserResult<never> => ({ status: ADMISSION_CONTACT_BROWSER_STATUS.failed, code, message: ADMISSION_ERROR_MESSAGE[code], uncertain, ...(operation ? { operation } : {}) });
  const base = (slug: string) => `${ADMISSION_CONTACT_BROWSER_PATH.prefix}/${encodeURIComponent(slug)}/${ADMISSION_CONTACT_BROWSER_PATH.segment}`;
  /** @param url - Same-origin own route. @param schema - Own output contract. @param signal - Original caller cancellation/deadline. @param body - Optional exact write proposal. @returns Guarded data, controlled failure or cancellation; no request is retried. */
  async function request<Value>(url: string, schema: z.ZodType<Value>, signal: AbortSignal, body?: { operationId: string }, readError: z.ZodType<{ code: string; operation?: AdmissionErrorOperation }> = admissionPublicErrorSchema): Promise<AdmissionContactBrowserResult<Value>> {
    const writing = body !== undefined;
    if (signal.aborted) return { status: ADMISSION_CONTACT_BROWSER_STATUS.aborted };
    try {
      const response = await transport(url, { method: writing ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const value: unknown = await response.json();
      if (signal.aborted) return { status: ADMISSION_CONTACT_BROWSER_STATUS.aborted };
      const error = readError.safeParse(value);
      if (!response.ok || error.success) {
        if (!error.success || error.data.operation && body && error.data.operation.operationId.toLowerCase() !== body.operationId.toLowerCase()) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
        const code = Object.values(ADMISSION_ERROR_CODE).find((candidate) => candidate === error.data.code) ?? ADMISSION_ERROR_CODE.dependencyUnavailable;
        const uncertain = writing && (code === ADMISSION_ERROR_CODE.operationUnresolved || error.data.operation?.state === OPERATION_STATE.started || response.status >= HTTP_STATUS.serverError);
        return failed(code, uncertain, error.data.operation);
      }
      const parsed = schema.safeParse(value);
      return parsed.success ? { status: ADMISSION_CONTACT_BROWSER_STATUS.ready, value: parsed.data } : failed(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
    } catch { return signal.aborted ? { status: ADMISSION_CONTACT_BROWSER_STATUS.aborted } : failed(ADMISSION_ERROR_CODE.dependencyUnavailable, writing); }
  }
  /** @typeParam Snapshot - Minimal own commit result. @param url - Fixed own write path. @param input - Original request identity and proposal. @param schema - Snapshot guard. @param signal - Caller cancellation. @param matches - Intent-specific result binding. @returns Original usable state or ambiguity without manufacturing progress. */
  async function command<Snapshot>(url: string, input: { operationId: string }, schema: z.ZodType<Snapshot>, signal: AbortSignal, matches: (snapshot: Snapshot) => boolean = () => true) {
    const result = await request(url, createAdmissionOperationStateSchema(schema), signal, input);
    if (result.status !== ADMISSION_CONTACT_BROWSER_STATUS.ready) return result;
    if (result.value.operationId.toLowerCase() !== input.operationId.toLowerCase() || result.value.state === OPERATION_STATE.completed && !matches(result.value.result)) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
    return result;
  }
  return {
    issue: (slug, input, signal) => command(`${base(slug)}/${ADMISSION_CONTACT_BROWSER_PATH.challenges}`, input, admissionChallengeSnapshotSchema, signal, (snapshot) => snapshot.channel === input.channel),
    verify: (slug, challengeId, input, signal) => command(`${base(slug)}/${ADMISSION_CONTACT_BROWSER_PATH.challenges}/${encodeURIComponent(challengeId)}/${ADMISSION_CONTACT_BROWSER_PATH.verify}`, input, admissionVerifiedContactSchema, signal),
    resend: (slug, challengeId, input, signal) => command(`${base(slug)}/${ADMISSION_CONTACT_BROWSER_PATH.challenges}/${encodeURIComponent(challengeId)}/${ADMISSION_CONTACT_BROWSER_PATH.resend}`, input, admissionChallengeSnapshotSchema, signal, (snapshot) => !input.useSmsAlternative || snapshot.channel === MESSAGING_PUBLIC_CHANNEL.sms),
    apply: (slug, requestId, input, signal) => command(`${base(slug)}/${ADMISSION_CONTACT_BROWSER_PATH.requests}/${encodeURIComponent(requestId)}/${ADMISSION_CONTACT_BROWSER_PATH.proof}`, input, admissionProofApplicationSnapshotSchema.options[0], signal, (snapshot) => snapshot.requestId.toLowerCase() === requestId.toLowerCase() && snapshot.proofId.toLowerCase() === input.proofId.toLowerCase() && snapshot.requestVersion === input.expectedVersion + 1),
    operation: (slug, operationId, signal) => request(`${base(slug)}/${ADMISSION_CONTACT_BROWSER_PATH.operations}/${encodeURIComponent(operationId)}`, admissionOperationRecoverySchema, signal),
    delivery: async (slug, deliveryId, signal) => {
      const result = await request(`${ADMISSION_CONTACT_BROWSER_PATH.prefix}/${encodeURIComponent(slug)}/${ADMISSION_CONTACT_BROWSER_PATH.messaging}/${ADMISSION_CONTACT_BROWSER_PATH.deliveries}/${encodeURIComponent(deliveryId)}`, messageDeliverySchema, signal, undefined, messagingPublicErrorSchema);
      return result.status === ADMISSION_CONTACT_BROWSER_STATUS.ready && (result.value.id.toLowerCase() !== deliveryId.toLowerCase() || result.value.purpose !== ADMISSION_VERIFICATION_PURPOSE.admission) ? failed(ADMISSION_ERROR_CODE.publicContractUnusable, false) : result;
    },
  };
}

/** Default application transport retains no viewer, credential, code or mutable provider client. */
export const admissionContactApiClient = createAdmissionContactApiClient();
