"use client";
/** Consumes guarded own import resources without implicit writes. @module allowlist-import-api-client */
import type { AllowlistImportBrowserClient } from "@/src/modules/academy-admissions/application/ports/allowlist-import-browser-client";
import { allowlistImportSchema } from "@/src/modules/academy-admissions/application/results/admission-management-result-schemas";
import { admissionPolicyStateResultSchema } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { allowlistImportReferenceSchema, allowlistImportConfirmationResultSchema } from "@/src/modules/academy-admissions/application/results/allowlist-import-operation-schemas";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { ALLOWLIST_BROWSER_PATH } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { ALLOWLIST_IMPORT_BROWSER_PATH as PATH, ALLOWLIST_IMPORT_FILE_NAME } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { createAllowlistApiClient } from "./allowlist-api-client";
import { createAllowlistBrowserTransport, allowlistBrowserFailure as failure } from "./allowlist-browser-transport";
/** @param options - Own native viewer and transport boundaries. @returns Bound import requests and private files, without writes on initialization or GET. */
export function createAllowlistImportApiClient(options: { fetch?: typeof fetch; viewer?: AllowlistImportBrowserClient["viewer"] } = {}): AllowlistImportBrowserClient {
  const transport = options.fetch ?? fetch, { json, rejected } = createAllowlistBrowserTransport(transport), list = createAllowlistApiClient(options);
  const base = (slug: string) => `${ALLOWLIST_BROWSER_PATH.prefix}/${encodeURIComponent(slug)}/${ALLOWLIST_BROWSER_PATH.segment}`;
  return {
    viewer: list.viewer, operation: list.operation,
    policy: (slug, signal) => json(`${base(slug)}/${PATH.policy}`, admissionPolicyStateResultSchema, signal),
    read: async (slug, importId, signal) => { const result = await json(`${base(slug)}/${PATH.imports}/${encodeURIComponent(importId)}`, allowlistImportSchema, signal); return result.status === "ready" && result.value.importId !== importId.toLowerCase() ? failure(ADMISSION_ERROR_CODE.publicContractUnusable) : result; },
    write: async (slug, intent, draft, signal) => {
      if (intent.type === REAUTHENTICATION_OPERATION.previewAllowlistImport) {
        if (!draft) return failure(ADMISSION_ERROR_CODE.invalidInput);
        const { type, ...proposal } = intent;
        void type;
        const body = { ...proposal, confirmed: true, csvText: draft.csvText };
        const result = await json(`${base(slug)}/${PATH.imports}`, createAdmissionOperationStateSchema(allowlistImportReferenceSchema), signal, body);
        if (result.status === "ready" && (result.value.operationId !== intent.operationId || result.value.state === OPERATION_STATE.completed && result.value.result.sourceVersion !== 1)) return failure(ADMISSION_ERROR_CODE.publicContractUnusable, true);
        return result;
      }
      const { type, importId, ...proposal } = intent;
      void type;
      const body = { ...proposal, confirmed: true };
      const result = await json(`${base(slug)}/${PATH.imports}/${encodeURIComponent(importId)}/${PATH.confirm}`, createAdmissionOperationStateSchema(allowlistImportConfirmationResultSchema), signal, body);
      if (result.status === "ready" && (result.value.operationId !== intent.operationId || result.value.state === OPERATION_STATE.completed && (result.value.result.importId !== importId || result.value.result.sourceVersion < intent.expectedVersion))) return failure(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      return result;
    },
    file: async (slug, kind, importId, signal) => {
      if (kind === "report" && !importId) return failure(ADMISSION_ERROR_CODE.invalidInput);
      if (signal.aborted) return { status: "aborted" };
      try {
        const path = kind === "template" ? PATH.template : `${encodeURIComponent(importId!)}/${PATH.report}`;
        const response = await transport(`${base(slug)}/${PATH.imports}/${path}`, { credentials: "same-origin", cache: "no-store", signal });
        if (!response.ok) return await rejected(response);
        if (signal.aborted) return { status: "aborted" };
        if (response.headers.get("content-type") !== "text/csv; charset=utf-8" || response.headers.get("x-content-type-options") !== "nosniff" || response.headers.get("cache-control") !== "no-store" || !response.headers.get("content-disposition")?.startsWith("attachment;")) return failure(ADMISSION_ERROR_CODE.publicContractUnusable);
        const blob = await response.blob();
        return signal.aborted ? { status: "aborted" } : { status: "ready", value: { blob, fileName: ALLOWLIST_IMPORT_FILE_NAME[kind] } };
      } catch { return signal.aborted ? { status: "aborted" } : failure(ADMISSION_ERROR_CODE.dependencyUnavailable); }
    },
  };
}
export const allowlistImportApiClient = createAllowlistImportApiClient();
