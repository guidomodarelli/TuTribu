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
import type { z } from "zod";
import { admissionApiClient } from "./admission-api-client";
import { createAdmissionManagementBrowserTransport, admissionManagementBrowserFailure as failure } from "./admission-management-browser-transport";

/** Write intents accepted by the management client. */
type PersonalInvitationWriteIntent = Parameters<PersonalInvitationManagementBrowserClient["write"]>[1];
/** Confirmed outcome of a rename/revoke or a creation. */
type PersonalInvitationWriteOutcome = z.infer<typeof personalInvitationMutationOperationSchema> | z.infer<ReturnType<typeof createPersonalInvitationHttpCreationSchema>>;

/** @param outcome - Guarded own operation. @param intent - Original write intent. @returns Whether the outcome contradicts the original identity or, for a rename/revoke, its invitation or counter. */
function isUnboundWriteOutcome(outcome: PersonalInvitationWriteOutcome, intent: PersonalInvitationWriteIntent): boolean {
  if (outcome.operationId !== intent.input.operationId) return true;
  if (outcome.state !== OPERATION_STATE.completed || intent.type === REAUTHENTICATION_OPERATION.createPersonalInvitation) return false;
  const { result } = outcome;
  return result.invitationId !== intent.invitationId || result.created || result.version !== intent.input.expectedVersion + (result.changed ? 1 : 0);
}

/** Result of one management write. */
type PersonalInvitationWriteResult = Awaited<ReturnType<PersonalInvitationManagementBrowserClient["write"]>>;

/** @param slug - Tribe slug. @returns The personal invitation management collection path of the tribe. */
function managementBase(slug: string): string {
  return `${PERSONAL_INVITATION_MANAGEMENT_PATH.prefix}/${encodeURIComponent(slug)}/${PERSONAL_INVITATION_MANAGEMENT_PATH.segment}`;
}

/** @param slug - Tribe slug. @param intent - Write intent. @returns The collection for a creation, or the invitation (and its revoke action) for a rename/revoke. */
function personalInvitationWritePath(slug: string, intent: PersonalInvitationWriteIntent): string {
  if (intent.type === REAUTHENTICATION_OPERATION.createPersonalInvitation) return managementBase(slug);
  const action = intent.type === REAUTHENTICATION_OPERATION.revokePersonalInvitation ? `/${PERSONAL_INVITATION_MANAGEMENT_PATH.revoke}` : "";
  return `${managementBase(slug)}/${encodeURIComponent(intent.invitationId)}${action}`;
}

/**
 * Reads the accepted response of a dispatched write; every failure is marked as dispatched.
 * @param response - Accepted HTTP response.
 * @param intent - Original write intent.
 * @param read - Abort signal and, for a creation, the schema bound to the current origin.
 * @returns The bound outcome with its viewer, the public error, or an unusable contract.
 */
async function readAcceptedWrite(response: Response, intent: PersonalInvitationWriteIntent, { signal, creationSchema }: { signal: AbortSignal; creationSchema: ReturnType<typeof createPersonalInvitationHttpCreationSchema> | null }): Promise<PersonalInvitationWriteResult> {
  const value: unknown = await response.json();
  if (signal.aborted) return { status: "aborted" };
  const error = admissionPublicErrorSchema.safeParse(value);
  if (error.success) return error.data.operation && error.data.operation.operationId !== intent.input.operationId ? failure(ADMISSION_ERROR_CODE.publicContractUnusable, true) : failure(error.data.code, true);
  let metadataValue: unknown; try { metadataValue = JSON.parse(response.headers.get(PERSONAL_INVITATION_VIEWER_HEADER) ?? "null"); } catch { return failure(ADMISSION_ERROR_CODE.publicContractUnusable, true); }
  const parsed = (creationSchema ?? personalInvitationMutationOperationSchema).safeParse(value), metadata = personalInvitationViewerMetadataSchema.safeParse(metadataValue);
  if (!parsed.success || !metadata.success || metadata.data.viewerId === null || isUnboundWriteOutcome(parsed.data, intent)) return failure(ADMISSION_ERROR_CODE.publicContractUnusable, true);
  return { status: "ready", value: { outcome: parsed.data, viewerId: metadata.data.viewerId } };
}

/** @param options - Own transport/viewer edges. @returns Scope-bound reads and one-shot commands; render/import never dispatch. */
export function createPersonalInvitationManagementApiClient(options: { fetch?: typeof fetch; viewer?: PersonalInvitationManagementBrowserClient["viewer"]; origin?: () => string } = {}): PersonalInvitationManagementBrowserClient {
  const transport = options.fetch ?? fetch, { json: request, rejected } = createAdmissionManagementBrowserTransport(transport);
  return {
    viewer: options.viewer ?? (async (signal) => { const result = await admissionApiClient.viewer(signal); return result.status === "failed" ? failure(result.code) : result; }),
    page: async (slug, query, signal) => {
      const search = new URLSearchParams({ limit: String(query.limit), ...(query.status ? { status: query.status } : {}), ...(query.cursor ? { cursor: query.cursor } : {}) });
      const result = await request(`${managementBase(slug)}/${PERSONAL_INVITATION_MANAGEMENT_PATH.context}?${search}`, personalInvitationManagementPageStateSchema, signal);
      if (result.status !== "ready") return result;
      return result.value.kind === "ready" && result.value.slug === slug ? { status: "ready", value: result.value } : failure(ADMISSION_ERROR_CODE.publicContractUnusable);
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
        const creation = intent.type === REAUTHENTICATION_OPERATION.createPersonalInvitation, { origin } = options;
        if (creation && !origin) return failure(ADMISSION_ERROR_CODE.publicContractUnusable);
        const creationSchema = creation && origin ? createPersonalInvitationHttpCreationSchema(origin()) : null;
        const path = personalInvitationWritePath(slug, intent);
        dispatched = true;
        const response = await transport(path, { method: intent.type === REAUTHENTICATION_OPERATION.renamePersonalInvitation ? "PATCH" : "POST", credentials: "same-origin", cache: "no-store", signal, headers: { "content-type": "application/json" }, body: JSON.stringify(intent.input) });
        if (signal.aborted) return { status: "aborted" };
        if (!response.ok) return await rejected(response, true, intent.input.operationId);
        return await readAcceptedWrite(response, intent, { signal, creationSchema });
      } catch { return signal.aborted ? { status: "aborted" } : failure(dispatched ? ADMISSION_ERROR_CODE.dependencyUnavailable : ADMISSION_ERROR_CODE.publicContractUnusable, dispatched); }
    },
  };
}
export const personalInvitationManagementApiClient = createPersonalInvitationManagementApiClient();
