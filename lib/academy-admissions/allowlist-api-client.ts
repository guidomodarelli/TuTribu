"use client";
/** Consumes own list DTOs and preserves original uncertainty without automatic retries or route refresh. @module allowlist-api-client */
import type { AllowlistBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-browser-client";
import { allowlistPageSchema } from "@/src/modules/academy-admissions/application/results/allowlist-query-schemas";
import { allowlistEntrySchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { allowlistMutationResultSchema } from "@/src/modules/academy-admissions/application/results/allowlist-mutation-schemas";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { admissionApiClient } from "./admission-api-client";
import { ALLOWLIST_BROWSER_PATH } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { createAllowlistBrowserTransport, allowlistBrowserFailure as failure } from "./allowlist-browser-transport";

/** @param options - Owned same-origin transport and native minimal viewer port. @returns Guarded list commands/queries; no request starts on import or render. */
export function createAllowlistApiClient(options: { fetch?: typeof fetch; viewer?: AllowlistBrowserClient["viewer"] } = {}): AllowlistBrowserClient {
  const { json: request } = createAllowlistBrowserTransport(options.fetch ?? fetch);
  const base = (slug: string) => `${ALLOWLIST_BROWSER_PATH.prefix}/${encodeURIComponent(slug)}/${ALLOWLIST_BROWSER_PATH.segment}`;
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
