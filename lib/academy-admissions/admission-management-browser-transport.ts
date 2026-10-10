"use client";
/** Shares own management JSON/error transport without hiding resource-specific binding rules. @module admission-management-browser-transport */
import type { z } from "zod";
import type { PersonalInvitationManagementBrowserResult as ManagementBrowserResult } from "@/src/modules/academy-admissions/application/ports/personal-invitation-management-browser-client";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";

/** @param code - Own catalog code. @param uncertain - A write reply does not prove its final effect. @returns Safe Spanish feedback only. */
export function admissionManagementBrowserFailure(code: AdmissionErrorCode, uncertain = false): ManagementBrowserResult<never> { return { status: "failed", code, message: ADMISSION_ERROR_MESSAGE[code], uncertain }; }
/** @param transport - Explicit project-owned HTTP edge. @returns JSON requests and own error parsing, without automatic retry. */
export function createAdmissionManagementBrowserTransport(transport: typeof fetch) {
  /** @param response - Own middleend response. @param writing - Whether a write was sent. @param operationId - Exact original identity, if sent. @returns Own controlled failure without copying diagnostics. */
  async function rejected(response: Response, writing = false, operationId?: string): Promise<ManagementBrowserResult<never>> {
    let value: unknown;
    try { value = await response.json(); } catch { return admissionManagementBrowserFailure(ADMISSION_ERROR_CODE.publicContractUnusable, writing); }
    const parsed = admissionPublicErrorSchema.safeParse(value);
    if (!parsed.success || parsed.data.operation && operationId && parsed.data.operation.operationId !== operationId) return admissionManagementBrowserFailure(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
    return admissionManagementBrowserFailure(parsed.data.code, writing && (response.status >= HTTP_STATUS.serverError || parsed.data.operation?.state === OPERATION_STATE.started));
  }
  /** @param path - Static own resource. @param schema - Public own DTO guard. @param signal - Explicit scope cancellation. @param body - Exact original command. @param method - Static write method. @returns Guarded own result, controlled uncertainty or cancellation. */
  async function json<Value>(path: string, schema: z.ZodType<Value>, signal: AbortSignal, body?: { operationId: string }, method = "POST"): Promise<ManagementBrowserResult<Value>> {
    const writing = Boolean(body);
    if (signal.aborted) return { status: "aborted" };
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
  return { json, rejected };
}
