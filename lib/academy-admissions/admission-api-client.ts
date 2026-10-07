"use client";

/** Uses same-origin own endpoints and the actual Better Auth SDK; no raw failure reaches product UI. @module admission-api-client */
import { z } from "zod";
import { createAuthClient } from "better-auth/client";
import type { AdmissionBrowserClient, AdmissionBrowserResult } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import { admissionOverviewSchema, admissionRequestSchema, admissionOutcomeSchema, admissionReviewSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionReviewPageSchema } from "@/src/modules/academy-admissions/application/results/admission-review-page-result";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import type { AdmissionBrowserSubmission, AdmissionStartedResponse } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionOutcomeDto } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { admissionTransitionResultSchema } from "@/src/modules/academy-admissions/application/results/admission-writer-result-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { HTTP_STATUS } from "@/src/constants/http-status";
import type { AdmissionPolicyBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-policy-browser-client";
import { admissionPolicyStateResultSchema, admissionPolicyMutationResultSchema } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { admissionPreflightResultSchema } from "@/src/modules/academy-admissions/application/results/admission-preflight-result-schema";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ADMISSION_POLICY_BROWSER_PATH } from "@/src/modules/academy-admissions/constants/admission-policy-browser";

/** Own public progress cannot carry an unconfirmed result. */
const startedSchema = z.object({ state: z.literal("started"), operationId: z.uuid() });
const submissionSchema = z.union([admissionOutcomeSchema, startedSchema]);
const cancellationSchema = z.union([admissionTransitionResultSchema, startedSchema]);
const ADMISSION_API_PREFIX = "/api/tribes";
const ADMISSION_API_SEGMENT = "admissions";
const ACADEMY_ENTRY_SEGMENT = "academy/join";
/** Explicit compatibility submission retains the owner's recoverable transport contract. */
export type AcademyAdmissionBrowserEntry = { submitAcademyEntry(slug: string, input: AdmissionBrowserSubmission, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionOutcomeDto | AdmissionStartedResponse>> };

/** @param options - Explicit own HTTP transport; the default viewer uses the installed native SDK. @returns A same-origin application client with cancellation and safe owned contracts. */
export function createAdmissionApiClient(options: { fetch?: typeof globalThis.fetch; viewer?: AdmissionBrowserClient["viewer"] } = {}): AdmissionBrowserClient & AdmissionReviewBrowserClient & AcademyAdmissionBrowserEntry & AdmissionPolicyBrowserClient {
  const transport = options.fetch ?? globalThis.fetch;
  const auth = options.viewer ? null : createAuthClient();
  /** Converts a native rejection to safe copy without exposing a cause or claiming accepted work. */
  const failed = (code: typeof ADMISSION_ERROR_CODE[keyof typeof ADMISSION_ERROR_CODE], uncertain = false): AdmissionBrowserResult<never> => ({ status: "failed", code, message: ADMISSION_ERROR_MESSAGE[code], uncertain });
  const base = (slug: string) => `${ADMISSION_API_PREFIX}/${encodeURIComponent(slug)}/${ADMISSION_API_SEGMENT}`;

  /** Reads only own public JSON contracts; a malformed successful write remains ambiguous. */
  async function request<Value>(url: string, schema: z.ZodType<Value>, signal: AbortSignal, body?: object, method?: "POST" | "PUT"): Promise<AdmissionBrowserResult<Value>> {
    const writing = body !== undefined;
    if (signal.aborted) return { status: "aborted" };
    try {
      const response = await transport(url, { method: writing ? method ?? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal, ...(writing ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const value: unknown = await response.json();
      if (signal.aborted) return { status: "aborted" };
      if (!response.ok) {
        const error = admissionPublicErrorSchema.safeParse(value);
        return error.success ? failed(error.data.code, writing && (response.status >= HTTP_STATUS.serverError || error.data.operation !== undefined)) : failed(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
      }
      const parsed = schema.safeParse(value);
      return parsed.success ? { status: "ready", value: parsed.data } : failed(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
    } catch { return signal.aborted ? { status: "aborted" } : failed(ADMISSION_ERROR_CODE.dependencyUnavailable, writing); }
  }

  /** Validates the original command identity/counter before a browser can treat a response as confirmed. */
  async function policyCommand(slug: string, path: string, input: { operationId: string; confirmed: true; expectedVersion?: number }, signal: AbortSignal, method: "POST" | "PUT" = "POST") {
    const result = await request(`${base(slug)}/${path}`, createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema), signal, input, method);
    if (result.status !== "ready") return result;
    const operation = result.value;
    if (operation.operationId !== input.operationId.toLowerCase()) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
    if (operation.state === "completed") {
      const snapshot = operation.result;
      if (input.expectedVersion !== undefined && snapshot.version !== input.expectedVersion + (snapshot.changed ? 1 : 0)) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      if (path === ADMISSION_POLICY_BROWSER_PATH.activate && !snapshot.controlActivated) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      if (path === ADMISSION_POLICY_BROWSER_PATH.policy && input.expectedVersion === undefined && snapshot.changed && (snapshot.version !== 1 || snapshot.verificationEpoch !== 1 || snapshot.controlActivated)) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
    }
    return result;
  }

  return {
    readPolicy: (slug, signal) => request(`${base(slug)}/${ADMISSION_POLICY_BROWSER_PATH.policy}`, admissionPolicyStateResultSchema, signal),
    readPreflight: (slug, signal) => request(`${base(slug)}/${ADMISSION_POLICY_BROWSER_PATH.preflight}`, admissionPreflightResultSchema, signal),
    initializePolicy: (slug, input, signal) => policyCommand(slug, ADMISSION_POLICY_BROWSER_PATH.policy, input, signal),
    updatePolicy: (slug, input, signal) => policyCommand(slug, ADMISSION_POLICY_BROWSER_PATH.policy, input, signal, "PUT"),
    activatePolicy: (slug, input, signal) => policyCommand(slug, ADMISSION_POLICY_BROWSER_PATH.activate, input, signal),
    pausePolicy: (slug, input, signal) => policyCommand(slug, ADMISSION_POLICY_BROWSER_PATH.pause, input, signal),
    /** Reads the native account id only; SDK session/token/provider fields stay within this adapter. */
    viewer: options.viewer ?? (async (signal) => {
      try {
        const result = await auth!.getSession({ query: { disableCookieCache: true }, fetchOptions: { signal } });
        if (signal.aborted) return { status: "aborted" };
        if (result.error) return result.error.status === HTTP_STATUS.unauthorized ? { status: "ready", value: null } : failed(ADMISSION_ERROR_CODE.dependencyUnavailable);
        return { status: "ready", value: result.data ? { id: result.data.user.id } : null };
      } catch { return signal.aborted ? { status: "aborted" } : failed(ADMISSION_ERROR_CODE.dependencyUnavailable); }
    }),
    overview: (slug, signal) => request(`${base(slug)}/overview`, admissionOverviewSchema, signal),
    own: (slug, requestId, signal) => request(`${base(slug)}/own-request${requestId ? `?${new URLSearchParams({ admissionRequestId: requestId })}` : ""}`, admissionRequestSchema.nullable(), signal),
    operation: (slug, operationId, signal) => request(`${base(slug)}/operations/${encodeURIComponent(operationId)}`, admissionOperationRecoverySchema, signal),
    submit: async (slug, input, signal) => {
      const result = await request(`${base(slug)}/submissions`, submissionSchema, signal, input);
      return result.status === "ready" && result.value.operationId !== input.operationId.toLowerCase() ? failed(ADMISSION_ERROR_CODE.publicContractUnusable, true) : result;
    },
    submitAcademyEntry: async (slug, input, signal) => {
      const result = await request(`${ADMISSION_API_PREFIX}/${encodeURIComponent(slug)}/${ACADEMY_ENTRY_SEGMENT}`, submissionSchema, signal, input);
      return result.status === "ready" && result.value.operationId !== input.operationId.toLowerCase() ? failed(ADMISSION_ERROR_CODE.publicContractUnusable, true) : result;
    },
    cancel: async (slug, requestId, input, signal) => {
      const result = await request(`${base(slug)}/requests/${encodeURIComponent(requestId)}/cancel`, cancellationSchema, signal, input);
      if (result.status === "ready" && ("state" in result.value ? result.value.operationId !== input.operationId.toLowerCase() : result.value.admissionRequestId !== requestId.toLowerCase() || result.value.status !== "cancelled")) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      return result;
    },
    reviewList: (slug, cursor, signal) => request(`${base(slug)}/requests?${new URLSearchParams({ status: ADMISSION_REQUEST_STATUS.pending, ...(cursor ? { cursor } : {}) })}`, admissionReviewPageSchema, signal),
    reviewDetail: async (slug, requestId, signal) => {
      const result = await request(`${base(slug)}/requests/${encodeURIComponent(requestId)}`, admissionReviewSchema, signal);
      return result.status === "ready" && result.value.id !== requestId.toLowerCase() ? failed(ADMISSION_ERROR_CODE.publicContractUnusable) : result;
    },
    decide: async (slug, requestId, input, signal) => {
      const result = await request(`${base(slug)}/requests/${encodeURIComponent(requestId)}/decision`, cancellationSchema, signal, input);
      const expectedStatus = input.decision === ADMISSION_DECISION.approve ? ADMISSION_REQUEST_STATUS.approved : ADMISSION_REQUEST_STATUS.rejected;
      if (result.status === "ready" && ("state" in result.value ? result.value.operationId !== input.operationId.toLowerCase() : result.value.admissionRequestId !== requestId.toLowerCase() || result.value.status !== expectedStatus || result.value.version !== input.expectedVersion + 1)) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      return result;
    },
  };
}

/** Shared route-owned transport; presenters never import it. */
export const admissionApiClient = createAdmissionApiClient();
