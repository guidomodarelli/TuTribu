"use client";

/** Uses same-origin own endpoints and the actual Better Auth SDK; no raw failure reaches product UI. @module admission-api-client */
import { z } from "zod";
import { createAuthClient } from "better-auth/client";
import type { AdmissionAccountBrowserClient, AdmissionBrowserClient, AdmissionBrowserResult, AdmissionBrowserSubmission, AdmissionStartedResponse  } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import { admissionOverviewSchema, admissionOwnRequestSchema, admissionOutcomeSchema, admissionReviewSchema, admissionBatchResultSchema, type AdmissionOutcomeDto , createAdmissionOperationStateSchema  } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { matchesAdmissionBatchDecisionResult } from "@/src/modules/academy-admissions/application/results/admission-batch-browser-result";
import { ADMISSION_REVIEW_BROWSER_PATH } from "@/src/modules/academy-admissions/constants/admission-review-browser";
import { admissionReviewPageSchema } from "@/src/modules/academy-admissions/application/results/admission-review-page-result";
import type { AdmissionReviewBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-review-browser-client";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { DEFAULT_ADMISSION_REVIEW_SELECTION } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { admissionReviewSelectionQuery } from "./admission-review-selection";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { admissionTransitionResultSchema, admissionWhatsappNumberResultSchema  } from "@/src/modules/academy-admissions/application/results/admission-writer-result-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { HTTP_STATUS } from "@/src/constants/http-status";
import type { AdmissionPolicyBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-policy-browser-client";
import { admissionPolicyStateResultSchema, admissionPolicyMutationResultSchema } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { admissionPreflightResultSchema } from "@/src/modules/academy-admissions/application/results/admission-preflight-result-schema";
import { ADMISSION_POLICY_BROWSER_PATH } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import type { AdmissionWhatsappNumberBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-whatsapp-number-browser-client";
import { ADMISSION_WHATSAPP_ROUTE_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";
import { boundBrowserRequest } from "@/lib/browser-request-deadline";
import { BROWSER_REQUEST_TIMEOUT_MESSAGE } from "@/src/constants/browser-request";

/** Own public progress cannot carry an unconfirmed result. */
const startedSchema = z.object({ state: z.literal("started"), operationId: z.uuid() });
const submissionSchema = z.union([admissionOutcomeSchema, startedSchema]);
const cancellationSchema = z.union([admissionTransitionResultSchema, startedSchema]);
const ADMISSION_API_PREFIX = "/api/tribes";
const ADMISSION_API_SEGMENT = "admissions";
const ACADEMY_ENTRY_SEGMENT = "academy/join";
/** Explicit compatibility submission retains the owner's recoverable transport contract. */
export type AcademyAdmissionBrowserEntry = { submitAcademyEntry(slug: string, input: AdmissionBrowserSubmission, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionOutcomeDto | AdmissionStartedResponse>> };

type AdmissionErrorCodeValue = typeof ADMISSION_ERROR_CODE[keyof typeof ADMISSION_ERROR_CODE];
/** Optional write of an own request: the original intent and its method when it differs from POST. */
type AdmissionWrite = { body?: object; method?: "POST" | "PUT" };
/** Own policy command: target path, original identity/counter and write method. */
type AdmissionPolicyCommand = { path: string; input: { operationId: string; confirmed: true; expectedVersion?: number }; method?: "POST" | "PUT" };

/** Converts a native rejection to safe copy without exposing a cause or claiming accepted work. */
function failed(code: AdmissionErrorCodeValue, uncertain = false): AdmissionBrowserResult<never> {
  return { status: "failed", code, message: ADMISSION_ERROR_MESSAGE[code], uncertain };
}

/**
 * Ends a hung call: the caller's cancellation stays an abort, while an expired deadline is a failure that keeps a
 * write uncertain (it may have committed), so its original intent is recovered instead of repeated.
 * @param callerSignal - The caller's own cancellation.
 * @param writing - Whether the call may have changed server state.
 * @param call - The call, run with a signal that also follows the deadline.
 * @returns The call's result, or a deadline failure when the response never arrived.
 */
function bounded<Value>(callerSignal: AbortSignal, writing: boolean, call: (signal: AbortSignal) => Promise<AdmissionBrowserResult<Value>>): Promise<AdmissionBrowserResult<Value>> {
  return boundBrowserRequest<AdmissionBrowserResult<Value>>(callerSignal, call, () => ({ status: "failed", code: ADMISSION_ERROR_CODE.transportTimeout, message: BROWSER_REQUEST_TIMEOUT_MESSAGE, uncertain: writing }));
}

/** @param body - Original write intent. @param operationId - Identity echoed by the own error. @returns Whether the echoed identity differs from the original one. */
function hasForeignOperation(body: object | undefined, operationId: string): boolean {
  return !body || !("operationId" in body) || typeof body.operationId !== "string" || operationId !== body.operationId.toLowerCase();
}

/**
 * Reads an own error DTO without turning accepted unresolved work into success or rollback.
 * @returns The safe failure, or `null` when the response carries a result instead.
 */
function readAdmissionFailure(response: Response, value: unknown, writing: boolean, body: object | undefined): AdmissionBrowserResult<never> | null {
  const error = !response.ok || response.status === HTTP_STATUS.accepted ? admissionPublicErrorSchema.safeParse(value) : null;
  if (!error || (response.ok && !(error.success && error.data.code === ADMISSION_ERROR_CODE.operationUnresolved))) return null;
  if (!error.success) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
  if (writing && error.data.operation && hasForeignOperation(body, error.data.operation.operationId)) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
  return failed(error.data.code, writing && (error.data.code === ADMISSION_ERROR_CODE.operationUnresolved || response.status >= HTTP_STATUS.serverError || error.data.operation?.state === OPERATION_STATE.started));
}

/** Sends one own request under a signal that already follows the caller and the deadline. */
async function send<Value>(transport: typeof globalThis.fetch, url: string, schema: z.ZodType<Value>, { signal, write }: { signal: AbortSignal; write: AdmissionWrite }): Promise<AdmissionBrowserResult<Value>> {
  const { body, method } = write;
  const writing = body !== undefined;
  try {
    const response = await transport(url, { method: writing ? method ?? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal, ...(writing ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const value: unknown = await response.json();
    if (signal.aborted) return { status: "aborted" };
    const failure = readAdmissionFailure(response, value, writing, body);
    if (failure) return failure;
    const parsed = schema.safeParse(value);
    return parsed.success ? { status: "ready", value: parsed.data } : failed(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
  } catch { return signal.aborted ? { status: "aborted" } : failed(ADMISSION_ERROR_CODE.dependencyUnavailable, writing); }
}

/** @param snapshot - Confirmed own policy snapshot. @param command - Original command. @returns Whether the confirmed snapshot contradicts the original counter or intent. */
function isUnboundPolicySnapshot(snapshot: z.infer<typeof admissionPolicyMutationResultSchema>, { path, input }: AdmissionPolicyCommand): boolean {
  if (input.expectedVersion !== undefined && snapshot.version !== input.expectedVersion + (snapshot.changed ? 1 : 0)) return true;
  if (path === ADMISSION_POLICY_BROWSER_PATH.activate && !snapshot.controlActivated) return true;
  return path === ADMISSION_POLICY_BROWSER_PATH.policy && input.expectedVersion === undefined && snapshot.changed && (snapshot.version !== 1 || snapshot.verificationEpoch !== 1 || snapshot.controlActivated);
}

/** @param auth - Installed native SDK client. @returns The default viewer: the native account id only; SDK session/token/provider fields stay within this adapter. */
function createSessionViewer(auth: ReturnType<typeof createAuthClient>): AdmissionBrowserClient["viewer"] {
  return (callerSignal) => bounded(callerSignal, false, async (signal) => {
    try {
      const result = await auth.getSession({ query: { disableCookieCache: true }, fetchOptions: { signal } });
      if (signal.aborted) return { status: "aborted" };
      if (result.error) return result.error.status === HTTP_STATUS.unauthorized ? { status: "ready", value: null } : failed(ADMISSION_ERROR_CODE.dependencyUnavailable);
      return { status: "ready", value: result.data ? { id: result.data.user.id } : null };
    } catch { return signal.aborted ? { status: "aborted" } : failed(ADMISSION_ERROR_CODE.dependencyUnavailable); }
  });
}

/** @param options - Explicit own HTTP transport; the default viewer uses the installed native SDK. @returns A same-origin application client with cancellation and safe owned contracts. */
export function createAdmissionApiClient(options: { fetch?: typeof globalThis.fetch; viewer?: AdmissionBrowserClient["viewer"] } = {}): AdmissionBrowserClient & AdmissionAccountBrowserClient & AdmissionReviewBrowserClient & AcademyAdmissionBrowserEntry & AdmissionPolicyBrowserClient & AdmissionWhatsappNumberBrowserClient {
  const transport = options.fetch ?? globalThis.fetch;
  const viewer = options.viewer ?? createSessionViewer(createAuthClient());
  const signOutClient = createAuthClient({ fetchOptions: { customFetchImpl: transport } });
  const base = (slug: string) => `${ADMISSION_API_PREFIX}/${encodeURIComponent(slug)}/${ADMISSION_API_SEGMENT}`;

  /**
   * Consumes own result/error DTOs without turning accepted unresolved work into success or rollback.
   * @param url - Same-origin own route.
   * @param schema - Public result contract selected by the caller.
   * @param callerSignal - Original caller cancellation.
   * @param write - Optional original write intent and its method when it differs from POST.
   * @returns Guarded data, cancellation or safe failure retaining uncertainty and original identity.
   */
  async function request<Value>(url: string, schema: z.ZodType<Value>, callerSignal: AbortSignal, write: AdmissionWrite = {}): Promise<AdmissionBrowserResult<Value>> {
    return bounded(callerSignal, write.body !== undefined, (signal) => send(transport, url, schema, { signal, write }));
  }

  /** Validates the original command identity/counter before a browser can treat a response as confirmed. */
  async function policyCommand(slug: string, command: AdmissionPolicyCommand, signal: AbortSignal) {
    const result = await request(`${base(slug)}/${command.path}`, createAdmissionOperationStateSchema(admissionPolicyMutationResultSchema), signal, { body: command.input, method: command.method });
    if (result.status !== "ready") return result;
    const operation = result.value;
    if (operation.operationId !== command.input.operationId.toLowerCase()) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
    if (operation.state === "completed" && isUnboundPolicySnapshot(operation.result, command)) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
    return result;
  }

  return {
    changeAccount: (callerSignal) => bounded(callerSignal, false, async (signal) => {
      try {
        const result = await signOutClient.signOut({ fetchOptions: { signal } });
        if (signal.aborted) return { status: "aborted" };
        return result.error ? failed(ADMISSION_ERROR_CODE.dependencyUnavailable) : { status: "ready", value: null };
      } catch { return signal.aborted ? { status: "aborted" } : failed(ADMISSION_ERROR_CODE.dependencyUnavailable); }
    }),
    readPolicy: (slug, signal) => request(`${base(slug)}/${ADMISSION_POLICY_BROWSER_PATH.policy}`, admissionPolicyStateResultSchema, signal),
    readPreflight: (slug, signal) => request(`${base(slug)}/${ADMISSION_POLICY_BROWSER_PATH.preflight}`, admissionPreflightResultSchema, signal),
    initializePolicy: (slug, input, signal) => policyCommand(slug, { path: ADMISSION_POLICY_BROWSER_PATH.policy, input }, signal),
    updatePolicy: (slug, input, signal) => policyCommand(slug, { path: ADMISSION_POLICY_BROWSER_PATH.policy, input, method: "PUT" }, signal),
    activatePolicy: (slug, input, signal) => policyCommand(slug, { path: ADMISSION_POLICY_BROWSER_PATH.activate, input }, signal),
    pausePolicy: (slug, input, signal) => policyCommand(slug, { path: ADMISSION_POLICY_BROWSER_PATH.pause, input }, signal),
    viewer,
    overview: (slug, signal) => request(`${base(slug)}/overview`, admissionOverviewSchema, signal),
    own: (slug, requestId, signal) => request(`${base(slug)}/own-request${requestId ? `?${new URLSearchParams({ admissionRequestId: requestId })}` : ""}`, admissionOwnRequestSchema.nullable(), signal),
    updateWhatsappNumber: async (slug, requestId, input, signal) => {
      const result = await request(`${base(slug)}/requests/${encodeURIComponent(requestId)}/${ADMISSION_WHATSAPP_ROUTE_SEGMENT}`, createAdmissionOperationStateSchema(admissionWhatsappNumberResultSchema), signal, { body: input });
      if (result.status !== "ready") return result;
      const operation = result.value;
      if (operation.operationId !== input.operationId.toLowerCase() || operation.state === OPERATION_STATE.completed && (operation.result.admissionRequestId.toLowerCase() !== requestId.toLowerCase() || operation.result.version !== input.expectedVersion + (operation.result.changed ? 1 : 0))) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      return { status: "ready", value: operation.state === OPERATION_STATE.completed ? operation.result : operation };
    },
    operation: (slug, operationId, signal) => request(`${base(slug)}/operations/${encodeURIComponent(operationId)}`, admissionOperationRecoverySchema, signal),
    submit: async (slug, input, signal) => {
      const result = await request(`${base(slug)}/submissions`, submissionSchema, signal, { body: input });
      return result.status === "ready" && result.value.operationId !== input.operationId.toLowerCase() ? failed(ADMISSION_ERROR_CODE.publicContractUnusable, true) : result;
    },
    submitAcademyEntry: async (slug, input, signal) => {
      const result = await request(`${ADMISSION_API_PREFIX}/${encodeURIComponent(slug)}/${ACADEMY_ENTRY_SEGMENT}`, submissionSchema, signal, { body: input });
      return result.status === "ready" && result.value.operationId !== input.operationId.toLowerCase() ? failed(ADMISSION_ERROR_CODE.publicContractUnusable, true) : result;
    },
    cancel: async (slug, requestId, input, signal) => {
      const result = await request(`${base(slug)}/requests/${encodeURIComponent(requestId)}/cancel`, cancellationSchema, signal, { body: input });
      if (result.status === "ready" && ("state" in result.value ? result.value.operationId !== input.operationId.toLowerCase() : result.value.admissionRequestId !== requestId.toLowerCase() || result.value.status !== "cancelled")) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      return result;
    },
    reviewList: (slug, cursor, signal, filters = DEFAULT_ADMISSION_REVIEW_SELECTION) => request(`${base(slug)}/requests?${new URLSearchParams({ ...admissionReviewSelectionQuery(filters), ...(cursor ? { cursor } : {}) })}`, admissionReviewPageSchema, signal),
    reviewDetail: async (slug, requestId, signal) => {
      const result = await request(`${base(slug)}/requests/${encodeURIComponent(requestId)}`, admissionReviewSchema, signal);
      return result.status === "ready" && result.value.id !== requestId.toLowerCase() ? failed(ADMISSION_ERROR_CODE.publicContractUnusable) : result;
    },
    decide: async (slug, requestId, input, signal) => {
      const result = await request(`${base(slug)}/requests/${encodeURIComponent(requestId)}/decision`, cancellationSchema, signal, { body: input });
      const expectedStatus = input.decision === ADMISSION_DECISION.approve ? ADMISSION_REQUEST_STATUS.approved : ADMISSION_REQUEST_STATUS.rejected;
      if (result.status === "ready" && ("state" in result.value ? result.value.operationId !== input.operationId.toLowerCase() : result.value.admissionRequestId !== requestId.toLowerCase() || result.value.status !== expectedStatus || result.value.version !== input.expectedVersion + 1)) return failed(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      return result;
    },
    decideBatch: async (slug, input, signal) => {
      const body = { operationId: input.operationId, confirmed: input.confirmed, decision: input.decision, internalReason: input.internalReason, ...(input.externalMessage !== undefined ? { externalMessage: input.externalMessage } : {}), items: input.items.map((item) => ({ requestId: item.requestId, expectedVersion: item.expectedVersion })) };
      const result = await request(`${base(slug)}/${ADMISSION_REVIEW_BROWSER_PATH.batchDecisions}`, admissionBatchResultSchema, signal, { body });
      return result.status === "ready" && !matchesAdmissionBatchDecisionResult(body, result.value) ? failed(ADMISSION_ERROR_CODE.publicContractUnusable, true) : result;
    },
  };
}

/** Shared route-owned transport; presenters never import it. */
export const admissionApiClient = createAdmissionApiClient();
