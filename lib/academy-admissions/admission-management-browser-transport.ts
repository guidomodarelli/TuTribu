"use client";
/** Shares own management JSON/error transport without hiding resource-specific binding rules. @module admission-management-browser-transport */
import type { z } from "zod";
import type { PersonalInvitationManagementBrowserResult as ManagementBrowserResult } from "@/src/modules/academy-admissions/application/ports/personal-invitation-management-browser-client";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode  } from "@/src/modules/academy-admissions/constants/admission-errors";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { boundBrowserRequest } from "@/lib/browser-request-deadline";
import { BROWSER_REQUEST_TIMEOUT_MESSAGE } from "@/src/constants/browser-request";

/** @param code - Own catalog code. @param uncertain - A write reply does not prove its final effect. @returns Safe Spanish feedback only. */
export function admissionManagementBrowserFailure(code: AdmissionErrorCode, uncertain = false): ManagementBrowserResult<never> { return { status: "failed", code, message: ADMISSION_ERROR_MESSAGE[code], uncertain }; }
/**
 * A response without the own JSON contract was answered by the hosting edge, not by the route. A client error there (a body over the
 * platform limit, a malformed request) proves the route never ran, so even a write is definitive; a request timeout or a server error
 * may follow a committed effect, so a write stays uncertain.
 * @param status - HTTP status of the response. @param writing - Whether a write was sent.
 * @returns The safe failure for that status.
 */
function rejectedWithoutContract(status: number, writing: boolean): ManagementBrowserResult<never> {
  const edgeRejection = status >= HTTP_STATUS.badRequest && status < HTTP_STATUS.serverError && status !== HTTP_STATUS.requestTimeout;
  if (!edgeRejection) return admissionManagementBrowserFailure(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
  return admissionManagementBrowserFailure(status === HTTP_STATUS.contentTooLarge ? ADMISSION_ERROR_CODE.invalidInput : ADMISSION_ERROR_CODE.publicContractUnusable, false);
}
/** Optional write of a management request: the exact original command and its static method. */
export type ManagementWrite = { body?: { operationId: string }; method?: string };
/** @param transport - Explicit project-owned HTTP edge. @returns JSON requests and own error parsing, without automatic retry. */
export function createAdmissionManagementBrowserTransport(transport: typeof fetch) {
  /** A hung response ends at the deadline with the shared timeout copy; a write stays uncertain because it may have committed. */
  const timedOut = (writing: boolean): ManagementBrowserResult<never> => ({ status: "failed", code: ADMISSION_ERROR_CODE.transportTimeout, message: BROWSER_REQUEST_TIMEOUT_MESSAGE, uncertain: writing });
  /** @param response - Own middleend response. @param writing - Whether a write was sent. @param operationId - Exact original identity, if sent. @returns Own controlled failure without copying diagnostics. */
  async function rejected(response: Response, writing = false, operationId?: string): Promise<ManagementBrowserResult<never>> {
    let value: unknown;
    try { value = await response.json(); } catch { return rejectedWithoutContract(response.status, writing); }
    const parsed = admissionPublicErrorSchema.safeParse(value);
    if (!parsed.success || parsed.data.operation && operationId && parsed.data.operation.operationId !== operationId) return admissionManagementBrowserFailure(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
    return admissionManagementBrowserFailure(parsed.data.code, writing && (response.status >= HTTP_STATUS.serverError || parsed.data.operation?.state === OPERATION_STATE.started));
  }
  /** @param path - Static own resource. @param schema - Public own DTO guard. @param callerSignal - Explicit scope cancellation. @param write - Exact original command (`body`) and its static write method (POST by default). @returns Guarded own result, controlled uncertainty or cancellation. */
  function json<Value>(path: string, schema: z.ZodType<Value>, callerSignal: AbortSignal, write: ManagementWrite = {}): Promise<ManagementBrowserResult<Value>> {
    const writing = Boolean(write.body);
    if (callerSignal.aborted) return Promise.resolve({ status: "aborted" });
    return boundBrowserRequest<ManagementBrowserResult<Value>>(callerSignal, (signal) => send(path, schema, signal, write), () => timedOut(writing));
  }
  /** Sends one own request under a signal that already follows the caller and the deadline. */
  async function send<Value>(path: string, schema: z.ZodType<Value>, signal: AbortSignal, { body, method = "POST" }: ManagementWrite): Promise<ManagementBrowserResult<Value>> {
    const writing = Boolean(body);
    try {
      const response = await transport(path, { method: writing ? method : "GET", credentials: "same-origin", cache: "no-store", signal, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
      if (signal.aborted) return { status: "aborted" };
      if (!response.ok) return await rejected(response, writing, body?.operationId);
      const value: unknown = await response.json();
      if (signal.aborted) return { status: "aborted" };
      const parsed = schema.safeParse(value);
      return parsed.success ? { status: "ready", value: parsed.data } : admissionManagementBrowserFailure(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
    } catch { return signal.aborted ? { status: "aborted" } : admissionManagementBrowserFailure(ADMISSION_ERROR_CODE.dependencyUnavailable, writing); }
  }
  return { json, rejected, timedOut };
}
