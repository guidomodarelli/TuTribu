"use client";
/** Adapts same-origin personal preview and native sign-out to safe own application contracts. @module personal-invitation-api-client */
import { createAuthClient } from "better-auth/client";
import { createAdmissionApiClient } from "./admission-api-client";
import type { PersonalInvitationBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-browser-client";
import type { AdmissionBrowserClient, AdmissionBrowserResult } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { PERSONAL_INVITATION_BROWSER_ROUTE, PERSONAL_INVITATION_VIEWER_HEADER, personalInvitationViewerMetadataSchema, personalInvitationBrowserOverviewSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-browser";
import { personalInvitationPreviewParamsSchema, personalInvitationPreviewQuerySchema } from "@/src/modules/academy-admissions/constants/personal-invitation-preview-input";

/** @param options - Own controlled HTTP/viewer boundaries or the actual installed native adapters. @returns A cancelable application port; private SDK data never enters its values. */
export function createPersonalInvitationApiClient(options: { fetch?: typeof globalThis.fetch; viewer?: AdmissionBrowserClient["viewer"] } = {}): PersonalInvitationBrowserClient {
  const transport = options.fetch ?? globalThis.fetch, admission = createAdmissionApiClient(options), auth = createAuthClient({ fetchOptions: { customFetchImpl: transport } });
  const failed = (code: AdmissionErrorCode): AdmissionBrowserResult<never> => ({ status: "failed", code, message: ADMISSION_ERROR_MESSAGE[code], uncertain: false });
  return {
    viewer: admission.viewer, operation: admission.operation, submit: admission.submit,
    async overview(token, proofId, signal) {
      if (signal.aborted) return { status: "aborted" };
      const params = personalInvitationPreviewParamsSchema.safeParse({ token }), query = personalInvitationPreviewQuerySchema.safeParse(proofId ? { proofId } : {});
      if (!params.success || !query.success) return failed(ADMISSION_ERROR_CODE.invalidInput);
      const search = query.data.proofId ? `?${new URLSearchParams({ proofId: query.data.proofId })}` : "";
      try {
        const response = await transport(`${PERSONAL_INVITATION_BROWSER_ROUTE.prefix}/${encodeURIComponent(params.data.token)}/${PERSONAL_INVITATION_BROWSER_ROUTE.overview}${search}`, { credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer", signal });
        if (signal.aborted) return { status: "aborted" };
        const value: unknown = await response.json();
        if (signal.aborted) return { status: "aborted" };
        if (!response.ok) {
          const failure = admissionPublicErrorSchema.safeParse(value);
          return failed(failure.success ? failure.data.code : ADMISSION_ERROR_CODE.publicContractUnusable);
        }
        let metadata: unknown;
        try { metadata = JSON.parse(response.headers.get(PERSONAL_INVITATION_VIEWER_HEADER) ?? ""); } catch { return failed(ADMISSION_ERROR_CODE.publicContractUnusable); }
        const viewer = personalInvitationViewerMetadataSchema.safeParse(metadata);
        if (!viewer.success) return failed(ADMISSION_ERROR_CODE.publicContractUnusable);
        const preview = personalInvitationBrowserOverviewSchema.safeParse({ preview: value, viewerId: viewer.data.viewerId });
        return preview.success ? { status: "ready", value: preview.data } : failed(ADMISSION_ERROR_CODE.publicContractUnusable);
      } catch { return signal.aborted ? { status: "aborted" } : failed(ADMISSION_ERROR_CODE.dependencyUnavailable); }
    },
    async changeAccount(signal) {
      if (signal.aborted) return { status: "aborted" };
      try {
        const result = await auth.signOut({ fetchOptions: { signal } });
        if (signal.aborted) return { status: "aborted" };
        return result.error ? failed(ADMISSION_ERROR_CODE.dependencyUnavailable) : { status: "ready", value: null };
      } catch { return signal.aborted ? { status: "aborted" } : failed(ADMISSION_ERROR_CODE.dependencyUnavailable); }
    },
  };
}

/** Only personal route containers consume this adapter. */
export const personalInvitationApiClient = createPersonalInvitationApiClient();
