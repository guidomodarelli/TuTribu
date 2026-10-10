"use client";
/** Consumes native scoped management DTOs without storing or reconstructing a one-view URL. @module personal-invitation-management-api-client */
import type { PersonalInvitationManagementBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-management-browser-client";
import { personalInvitationManagementPageStateSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-management-page";
import { createPersonalInvitationHttpCreationSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-http-schemas";
import { personalInvitationMutationOperationSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-management-schemas";
import { PERSONAL_INVITATION_MANAGEMENT_PATH } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";
import { PERSONAL_INVITATION_VIEWER_HEADER, personalInvitationViewerMetadataSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-browser";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { admissionApiClient } from "./admission-api-client";
import { createAdmissionManagementBrowserTransport, admissionManagementBrowserFailure as failure } from "./admission-management-browser-transport";

/** @param options - Own transport/viewer edges. @returns Scope-bound reads and one-shot commands; render/import never dispatch. */
export function createPersonalInvitationManagementApiClient(options: { fetch?: typeof fetch; viewer?: PersonalInvitationManagementBrowserClient["viewer"]; origin?: () => string } = {}): PersonalInvitationManagementBrowserClient {
  const transport = options.fetch ?? fetch, { json: request, rejected } = createAdmissionManagementBrowserTransport(transport);
  const base = (slug: string) => `${PERSONAL_INVITATION_MANAGEMENT_PATH.prefix}/${encodeURIComponent(slug)}/${PERSONAL_INVITATION_MANAGEMENT_PATH.segment}`;
  return {
    viewer: options.viewer ?? (async (signal) => { const result = await admissionApiClient.viewer(signal); return result.status === "failed" ? failure(result.code) : result; }),
    page: async (slug, query, signal) => {
      const search = new URLSearchParams({ limit: String(query.limit), ...(query.status ? { status: query.status } : {}), ...(query.cursor ? { cursor: query.cursor } : {}) });
      const result = await request(`${base(slug)}/${PERSONAL_INVITATION_MANAGEMENT_PATH.context}?${search}`, personalInvitationManagementPageStateSchema, signal);
      return result.status === "ready" ? result.value.kind === "ready" && result.value.slug === slug ? { status: "ready", value: result.value } : failure(ADMISSION_ERROR_CODE.publicContractUnusable) : result;
    },
    operation: async (slug, operationId, signal) => {
      if (signal.aborted) return { status: "aborted" };
      try {
        const response = await transport(`${PERSONAL_INVITATION_MANAGEMENT_PATH.prefix}/${encodeURIComponent(slug)}/${PERSONAL_INVITATION_MANAGEMENT_PATH.operations}/${encodeURIComponent(operationId)}`, { credentials: "same-origin", cache: "no-store", signal });
        if (signal.aborted) return { status: "aborted" };
        if (!response.ok) return await rejected(response);
        const parsed = admissionOperationRecoverySchema.safeParse(await response.json());
        let value: unknown; try { value = JSON.parse(response.headers.get(PERSONAL_INVITATION_VIEWER_HEADER) ?? "null"); } catch { return failure(ADMISSION_ERROR_CODE.publicContractUnusable); }
        const viewer = personalInvitationViewerMetadataSchema.safeParse(value);
        if (!parsed.success || parsed.data.operationId !== operationId || !viewer.success || !viewer.data.viewerId) return failure(ADMISSION_ERROR_CODE.publicContractUnusable);
        return signal.aborted ? { status: "aborted" } : { status: "ready", value: { original: parsed.data, viewerId: viewer.data.viewerId } };
      } catch { return signal.aborted ? { status: "aborted" } : failure(ADMISSION_ERROR_CODE.dependencyUnavailable); }
    },
    write: async (slug, intent, signal) => {
      if (signal.aborted) return { status: "aborted" };
      let dispatched = false;
      try {
        const creation = intent.type === REAUTHENTICATION_OPERATION.createPersonalInvitation;
        if (creation && !options.origin) return failure(ADMISSION_ERROR_CODE.publicContractUnusable);
        const creationSchema = creation ? createPersonalInvitationHttpCreationSchema(options.origin!()) : null;
        const path = creation ? base(slug) : `${base(slug)}/${encodeURIComponent(intent.invitationId)}${intent.type === REAUTHENTICATION_OPERATION.revokePersonalInvitation ? `/${PERSONAL_INVITATION_MANAGEMENT_PATH.revoke}` : ""}`;
        dispatched = true;
        const response = await transport(path, { method: intent.type === REAUTHENTICATION_OPERATION.renamePersonalInvitation ? "PATCH" : "POST", credentials: "same-origin", cache: "no-store", signal, headers: { "content-type": "application/json" }, body: JSON.stringify(intent.input) });
        if (signal.aborted) return { status: "aborted" };
        if (!response.ok) return await rejected(response, true, intent.input.operationId);
        const value: unknown = await response.json();
        if (signal.aborted) return { status: "aborted" };
        const error = admissionPublicErrorSchema.safeParse(value);
        if (error.success) return error.data.operation && error.data.operation.operationId !== intent.input.operationId ? failure(ADMISSION_ERROR_CODE.publicContractUnusable, true) : failure(error.data.code, true);
        const schema = creationSchema ?? personalInvitationMutationOperationSchema;
        let metadataValue: unknown; try { metadataValue = JSON.parse(response.headers.get(PERSONAL_INVITATION_VIEWER_HEADER) ?? "null"); } catch { return failure(ADMISSION_ERROR_CODE.publicContractUnusable, true); }
        const parsed = schema.safeParse(value), metadata = personalInvitationViewerMetadataSchema.safeParse(metadataValue);
        if (!parsed.success || !metadata.success || metadata.data.viewerId === null || parsed.data.operationId !== intent.input.operationId || parsed.data.state === OPERATION_STATE.completed && !creation && (parsed.data.result.invitationId !== intent.invitationId || parsed.data.result.created || parsed.data.result.version !== intent.input.expectedVersion + (parsed.data.result.changed ? 1 : 0))) return failure(ADMISSION_ERROR_CODE.publicContractUnusable, true);
        return { status: "ready", value: { outcome: parsed.data, viewerId: metadata.data.viewerId } };
      } catch { return signal.aborted ? { status: "aborted" } : failure(dispatched ? ADMISSION_ERROR_CODE.dependencyUnavailable : ADMISSION_ERROR_CODE.publicContractUnusable, dispatched); }
    },
  };
}
export const personalInvitationManagementApiClient = createPersonalInvitationManagementApiClient();
