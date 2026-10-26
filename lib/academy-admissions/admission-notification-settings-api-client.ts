"use client";
/** Consumes only same-origin own settings DTOs bound to their actual native viewer. @module admission-notification-settings-api-client */
import type { z } from "zod";
import type { AdmissionNotificationSettingsBrowserClient, AdmissionNotificationSettingsBrowserResult, AdmissionNotificationSettingsBoundResult } from "@/src/modules/notifications/application/ports/admission-notification-settings-browser-client";
import { ADMISSION_NOTIFICATION_SETTINGS_API as API, ADMISSION_NOTIFICATION_SETTINGS_BROWSER_STATUS as STATUS } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { ADMISSION_NOTIFICATION_PREFERENCE_STATUS as PREFERENCE_STATUS } from "@/src/modules/notifications/constants/admission-notification-preference";
import { ADMISSION_EMAIL_SETTINGS_STATUS as EMAIL_STATUS } from "@/src/modules/notifications/constants/admission-notification-email-settings";
import { admissionNotificationPreferenceReadResultSchema, admissionNotificationPreferenceChangeSchema, admissionNotificationPreferenceChangeResultSchema, admissionNotificationEmailSettingsViewSchema, admissionNotificationEmailSettingsCommandSchema, admissionNotificationEmailSettingsOperationSchema } from "@/src/modules/notifications/constants/admission-notification-settings-schemas";
import { PERSONAL_INVITATION_VIEWER_HEADER, personalInvitationViewerMetadataSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-browser";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { admissionApiClient } from "./admission-api-client";
import { createAdmissionManagementBrowserTransport, admissionManagementBrowserFailure as failure } from "./admission-management-browser-transport";
import { boundBrowserRequest } from "@/lib/browser-request-deadline";

/** @param options - Own HTTP and viewer ports. @returns Explicit commands and reads with cancellation, no automatic OAuth, retry or dispatch. */
export function createAdmissionNotificationSettingsApiClient(options: { fetch?: typeof fetch; viewer?: AdmissionNotificationSettingsBrowserClient["viewer"] } = {}): AdmissionNotificationSettingsBrowserClient {
  const transport = options.fetch ?? fetch, { rejected, timedOut } = createAdmissionManagementBrowserTransport(transport);
  const base = (slug: string) => `${API.prefix}/${encodeURIComponent(slug)}/${API.segment}`;
  /** @param path - Relative own resource. @param schema - Own public DTO guard. @param signal - Current scope cancellation. @param command - Explicit validated body and optional original identity. @returns A native viewer-bound own DTO or controlled failure; upstream payloads are never consumed here. */
  function request<Value>(path: string, schema: z.ZodType<Value>, callerSignal: AbortSignal, command?: { body: object; method: string; operationId?: string }): Promise<AdmissionNotificationSettingsBrowserResult<AdmissionNotificationSettingsBoundResult<Value>>> {
    if (callerSignal.aborted) return Promise.resolve({ status: STATUS.aborted });
    return boundBrowserRequest<AdmissionNotificationSettingsBrowserResult<AdmissionNotificationSettingsBoundResult<Value>>>(callerSignal, (signal) => send(path, schema, signal, command), () => timedOut(Boolean(command)));
  }
  /** Sends one own request under a signal that already follows the caller and the deadline. */
  async function send<Value>(path: string, schema: z.ZodType<Value>, signal: AbortSignal, command?: { body: object; method: string; operationId?: string }): Promise<AdmissionNotificationSettingsBrowserResult<AdmissionNotificationSettingsBoundResult<Value>>> {
    try {
      const response = await transport(path, { credentials: "same-origin", cache: "no-store", signal, ...(command ? { method: command.method, headers: { "content-type": "application/json" }, body: JSON.stringify(command.body) } : {}) });
      if (signal.aborted) return { status: STATUS.aborted };
      if (!response.ok) return await rejected(response, Boolean(command), command?.operationId);
      let value: unknown;
      try { value = await response.json(); } catch { return signal.aborted ? { status: STATUS.aborted } : failure(ADMISSION_ERROR_CODE.publicContractUnusable, Boolean(command)); }
      if (signal.aborted) return { status: STATUS.aborted };
      const ownError = admissionPublicErrorSchema.safeParse(value);
      if (ownError.success) return failure(ownError.data.operation && command?.operationId && ownError.data.operation.operationId !== command.operationId ? ADMISSION_ERROR_CODE.publicContractUnusable : ownError.data.code, Boolean(command));
      let metadata: unknown;
      try { metadata = JSON.parse(response.headers.get(PERSONAL_INVITATION_VIEWER_HEADER) ?? "null"); } catch { return failure(ADMISSION_ERROR_CODE.publicContractUnusable, Boolean(command)); }
      const parsed = schema.safeParse(value), viewer = personalInvitationViewerMetadataSchema.safeParse(metadata);
      if (!parsed.success || !viewer.success || viewer.data.viewerId === null) return failure(ADMISSION_ERROR_CODE.publicContractUnusable, Boolean(command));
      return { status: STATUS.ready, value: { viewerId: viewer.data.viewerId, data: parsed.data } };
    } catch { return signal.aborted ? { status: STATUS.aborted } : failure(ADMISSION_ERROR_CODE.dependencyUnavailable, Boolean(command)); }
  }
  return {
    viewer: options.viewer ?? admissionApiClient.viewer,
    readPreference: (slug, signal) => request(`${base(slug)}/${API.preference}`, admissionNotificationPreferenceReadResultSchema, signal),
    readEmail: (slug, signal) => request(`${base(slug)}/${API.email}`, admissionNotificationEmailSettingsViewSchema, signal),
    changePreference: async (slug, input, signal) => {
      const parsed = admissionNotificationPreferenceChangeSchema.safeParse(input);
      if (!parsed.success) return failure(ADMISSION_ERROR_CODE.invalidInput);
      const result = await request(`${base(slug)}/${API.preference}`, admissionNotificationPreferenceChangeResultSchema, signal, { body: parsed.data, method: API.preferenceMethod });
      if (result.status === STATUS.ready && result.value.data.status !== PREFERENCE_STATUS.rejected && (result.value.data.preference.mode !== parsed.data.mode || result.value.data.preference.version !== parsed.data.expectedVersion + (result.value.data.status === PREFERENCE_STATUS.changed ? 1 : 0))) return failure(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      return result;
    },
    changeEmail: async (slug, input, signal) => {
      const parsed = admissionNotificationEmailSettingsCommandSchema.safeParse(input);
      if (!parsed.success) return failure(ADMISSION_ERROR_CODE.invalidInput);
      const result = await request(`${base(slug)}/${API.email}`, admissionNotificationEmailSettingsOperationSchema, signal, { body: parsed.data, method: API.emailMethod, operationId: parsed.data.operationId });
      if (result.status === STATUS.ready) {
        const value = result.value.data;
        if (value.operationId !== parsed.data.operationId || value.state === OPERATION_STATE.completed && value.result.status !== EMAIL_STATUS.rejected && (value.result.settings.enabled !== parsed.data.enabled || value.result.settings.timeZone !== parsed.data.timeZone || value.result.settings.version !== parsed.data.expectedVersion + (value.result.status === EMAIL_STATUS.changed ? 1 : 0))) return failure(ADMISSION_ERROR_CODE.publicContractUnusable, true);
      }
      return result;
    },
    operation: async (slug, operationId, signal) => {
      const result = await request(`${base(slug)}/${API.operation}/${encodeURIComponent(operationId)}`, admissionOperationRecoverySchema, signal);
      if (result.status !== STATUS.ready) return result;
      if (result.value.data.type !== REAUTHENTICATION_OPERATION.updateAdmissionEmailSettings || result.value.data.operationId !== operationId) return failure(ADMISSION_ERROR_CODE.publicContractUnusable);
      const { type: _type, ...original } = result.value.data;
      return { status: STATUS.ready, value: { viewerId: result.value.viewerId, data: original } };
    },
  };
}
/** Importing the client creates no request or mutation. */
export const admissionNotificationSettingsApiClient = createAdmissionNotificationSettingsApiClient();
