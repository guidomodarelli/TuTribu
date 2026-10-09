"use client";
/** Consumes own list DTOs and preserves original uncertainty without automatic retries or route refresh. @module allowlist-api-client */
import type { z } from "zod";
import type { AllowlistBrowserClient, AllowlistBrowserResult } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import { allowlistPageSchema } from "@/src/modules/academy-admissions/application/results/allowlist-query-schemas";
import { allowlistEntrySchema, admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { allowlistMutationResultSchema } from "@/src/modules/academy-admissions/application/results/allowlist-mutation-schemas";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { admissionApiClient } from "./admission-api-client";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ALLOWLIST_BROWSER_PATH } from "@/src/modules/academy-admissions/constants/allowlist-browser";

/** @param options - Owned same-origin transport and native minimal viewer port. @returns Guarded list commands/queries; no request starts on import or render. */
export function createAllowlistApiClient(options: { fetch?: typeof fetch; viewer?: AllowlistBrowserClient["viewer"] } = {}): AllowlistBrowserClient {
  const transport = options.fetch ?? fetch;
  const failure = (code: typeof ADMISSION_ERROR_CODE[keyof typeof ADMISSION_ERROR_CODE], uncertain = false): AllowlistBrowserResult<never> => ({ status: "failed", code, message: ADMISSION_ERROR_MESSAGE[code], uncertain });
  const base = (slug: string) => `${ALLOWLIST_BROWSER_PATH.prefix}/${encodeURIComponent(slug)}/${ALLOWLIST_BROWSER_PATH.segment}`;
  /** @param path - Static own resource path. @param schema - Public own response contract. @param signal - Scope cancellation/deadline. @param body - Optional original command. @param method - Explicit operation only. @returns Safe DTO, controlled failure or cancellation without exposing diagnostics. */
  async function request<Value>(path: string, schema: z.ZodType<Value>, signal: AbortSignal, body?: { operationId: string }, method = "POST"): Promise<AllowlistBrowserResult<Value>> {
    const writing = Boolean(body);
    if (signal.aborted) return { status: "aborted" };
    try {
      const response = await transport(path, { method: writing ? method : "GET", credentials: "same-origin", cache: "no-store", signal, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const value: unknown = await response.json();
      if (signal.aborted) return { status: "aborted" };
      if (!response.ok) {
        const parsed = admissionPublicErrorSchema.safeParse(value);
        if (!parsed.success || parsed.data.operation && body && parsed.data.operation.operationId !== body.operationId) return failure(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
        return failure(parsed.data.code, writing && (response.status >= HTTP_STATUS.serverError || parsed.data.operation?.state === OPERATION_STATE.started));
      }
      const parsed = schema.safeParse(value);
      return parsed.success ? { status: "ready", value: parsed.data } : failure(ADMISSION_ERROR_CODE.publicContractUnusable, writing);
    } catch { return signal.aborted ? { status: "aborted" } : failure(ADMISSION_ERROR_CODE.dependencyUnavailable, writing); }
  }
  return {
    viewer: options.viewer ?? (async (signal) => { const result = await admissionApiClient.viewer(signal); return result.status === "failed" ? failure(result.code) : result; }),
    list: (slug, query, signal) => { const search = new URLSearchParams({ limit: String(query.limit), ...(query.search ? { search: query.search } : {}), ...(query.status ? { status: query.status } : {}), ...(query.cursor ? { cursor: query.cursor } : {}) }); return request(`${base(slug)}/${ALLOWLIST_BROWSER_PATH.entries}?${search}`, allowlistPageSchema, signal); },
    read: async (slug, entryId, signal) => { const result = await request(`${base(slug)}/${ALLOWLIST_BROWSER_PATH.entries}/${encodeURIComponent(entryId)}`, allowlistEntrySchema, signal); return result.status === "ready" && result.value.id !== entryId.toLowerCase() ? failure(ADMISSION_ERROR_CODE.publicContractUnusable) : result; },
    operation: (slug, operationId, signal) => request(`${base(slug)}/${ALLOWLIST_BROWSER_PATH.operations}/${encodeURIComponent(operationId)}`, admissionOperationRecoverySchema, signal),
    write: async (slug, intent, signal) => {
      const result = await request(`${base(slug)}/${ALLOWLIST_BROWSER_PATH.entries}${intent.type === REAUTHENTICATION_OPERATION.updateAllowlistEntry ? `/${encodeURIComponent(intent.entryId)}` : ""}`, createAdmissionOperationStateSchema(allowlistMutationResultSchema), signal, intent.input, intent.type === REAUTHENTICATION_OPERATION.updateAllowlistEntry ? "PATCH" : "POST");
      if (result.status !== "ready") return result;
      const original = result.value;
      if (original.operationId !== intent.input.operationId || original.state === "completed" && intent.type === REAUTHENTICATION_OPERATION.updateAllowlistEntry && (original.result.entryId !== intent.entryId || original.result.created || original.result.version !== intent.input.expectedVersion + (original.result.changed ? 1 : 0))) return failure(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      return result;
    },
  };
}
export const allowlistApiClient = createAllowlistApiClient();
