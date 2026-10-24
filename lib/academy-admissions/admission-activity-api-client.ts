"use client";
/** Adapts the own private snapshot endpoint while retaining the real native viewer client. @module admission-activity-api-client */
import type { AdmissionActivityBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-activity-browser-client";
import { admissionActivityPageSelectionSchema, admissionActivityReadyPageStateSchema } from "@/src/modules/academy-admissions/constants/admission-activity-page-schemas";
import { ADMISSION_ACTIVITY_BROWSER_PATH, ADMISSION_ACTIVITY_BROWSER_STATUS } from "@/src/modules/academy-admissions/constants/admission-activity-browser";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ROUTES } from "@/src/constants/routes";
import { createAdmissionManagementBrowserTransport, admissionManagementBrowserFailure } from "./admission-management-browser-transport";
import { admissionApiClient } from "./admission-api-client";

/** @param options - Optional own transport/viewer ports; SDK, DTO schemas and errors remain real. @returns A same-origin cancellable private read client with route and selection binding. */
export function createAdmissionActivityApiClient(options: { fetch?: typeof fetch; viewer?: AdmissionActivityBrowserClient["viewer"] } = {}): AdmissionActivityBrowserClient {
  const transport = createAdmissionManagementBrowserTransport(options.fetch ?? globalThis.fetch);
  return {
    viewer: options.viewer ?? admissionApiClient.viewer,
    async read(slug, selection, signal) {
      const parsed = admissionActivityPageSelectionSchema.safeParse(selection);
      if (!parsed.success) return admissionManagementBrowserFailure(ADMISSION_ERROR_CODE.invalidInput);
      const query = new URLSearchParams({ limit: String(parsed.data.limit) });
      for (const key of ["resourceType", "resourceId", "cursor"] as const) {
        const value = parsed.data[key];
        if (value !== undefined) query.set(key, value);
      }
      const result = await transport.json(`${ROUTES.api.tribes}/${encodeURIComponent(slug)}/${ADMISSION_ACTIVITY_BROWSER_PATH.snapshot}?${query}`, admissionActivityReadyPageStateSchema, signal);
      if (result.status !== ADMISSION_ACTIVITY_BROWSER_STATUS.ready) return result;
      const applied = result.value.selection;
      if (result.value.slug !== slug || applied.limit !== selection.limit || applied.resourceType !== selection.resourceType || applied.resourceId?.toLowerCase() !== selection.resourceId?.toLowerCase() || applied.cursor !== selection.cursor) return admissionManagementBrowserFailure(ADMISSION_ERROR_CODE.publicContractUnusable);
      return result;
    },
  };
}

/** The route container alone owns calls; presentational components never import this adapter. */
export const admissionActivityApiClient = createAdmissionActivityApiClient();
