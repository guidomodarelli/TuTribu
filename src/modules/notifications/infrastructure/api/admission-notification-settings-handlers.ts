/** Validates own notification settings requests and emits only scoped minimal public DTOs. @module admission-notification-settings-handlers */
import "server-only";
import type { z } from "zod";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { admissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "@/src/modules/academy-admissions/constants/admission-route-input";
import { createAdmissionRouteBoundary } from "@/src/modules/academy-admissions/infrastructure/api/admission-route-http";
import { hasAllowedAdmissionOrigin } from "@/src/modules/academy-admissions/infrastructure/api/admission-request-origin";
import type { AdmissionQueryServices } from "@/src/modules/academy-admissions/infrastructure/api/admission-query-handlers";
import type { AdmissionNotificationPreferencesUseCases } from "../../application/use-cases/admission-notification-preferences-use-cases";
import type { AdmissionNotificationEmailSettingsUseCases } from "../../application/use-cases/admission-notification-email-settings-use-cases";
import { ADMISSION_NOTIFICATION_SETTINGS_HTTP_OPERATION } from "../../constants/admission-notification-settings-http";
import { ADMISSION_EMAIL_SETTINGS_STATUS } from "../../constants/admission-notification-email-settings";
import { ADMISSION_NOTIFICATION_PREFERENCE_STATUS } from "../../constants/admission-notification-preference";
import { admissionNotificationPreferenceChangeSchema, admissionNotificationEmailSettingsCommandSchema, admissionNotificationPreferenceReadResultSchema, admissionNotificationPreferenceChangeResultSchema, admissionNotificationEmailSettingsViewSchema, admissionNotificationEmailSettingsOperationSchema } from "../../constants/admission-notification-settings-schemas";
import { toAdmissionNotificationPreferenceView, toAdmissionNotificationEmailSettingsView, toAdmissionNotificationEmailSettingsOperationView } from "./admission-notification-settings-mapper";
import { PERSONAL_INVITATION_VIEWER_HEADER, personalInvitationViewerMetadataSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-browser";

/** Native composition supplies inward application ports, never a browser-selected actor or provider. */
export type AdmissionNotificationSettingsServices = { resolveTribe: AdmissionQueryServices["resolveTribe"]; preferences: Pick<AdmissionNotificationPreferencesUseCases, "read" | "change">; email: Pick<AdmissionNotificationEmailSettingsUseCases, "read" | "change"> };
/** Contains only framework tenant selection, resolved within the current route boundary. */
type SettingsRouteContext = { params: Promise<{ slug: string }> };

/** @param response - Already guarded own DTO. @param result - Native actor metadata from the use case, never a request claim. @returns The same minimal body bound to its actual viewer through the common private metadata header. */
function bindViewer(response: Response, result: { viewerId?: string }): Response {
  if (result.viewerId !== undefined) response.headers.set(PERSONAL_INVITATION_VIEWER_HEADER, JSON.stringify(personalInvitationViewerMetadataSchema.parse({ viewerId: result.viewerId })));
  return response;
}

/** @param open - Current authenticated native composition, opened only after own inputs pass. @returns Separate preference and independent email read/write handlers; none creates a sender. */
export function createAdmissionNotificationSettingsHandlers(open: () => Promise<AdmissionNotificationSettingsServices>) {
  /** @param boundary - This request's single validation/error owner. @param request - Original request with untrusted query. @param context - Framework tenant params. @returns The validated slug or its own safe response before composition. */
  async function selection(boundary: ReturnType<typeof createAdmissionRouteBoundary>, request: Request, context: SettingsRouteContext) {
    const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
    if (!params.usable) return params;
    const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    return query.usable ? { usable: true as const, value: params.value.slug } : query;
  }

  /** @param boundary - This request's single validation/error owner. @param slug - Validated tenant slug. @returns The current composition and resolved tribe, or the safe failure response. */
  async function resolveSelectedTribe(boundary: ReturnType<typeof createAdmissionRouteBoundary>, slug: string) {
    const services = await open(), requestId = boundary.requestContext.requestId;
    const tribe = await services.resolveTribe.execute({ slug, requestId });
    return tribe.ok ? { usable: true as const, services, requestId, tribeId: tribe.value.tribeId } : { usable: false as const, response: boundary.failure(tribe.failure) };
  }

  /** @param boundary - This request's single validation/error owner. @param request - Original read request. @param context - Framework tenant params. @returns The resolved read scope, or its own safe response. */
  async function openRead(boundary: ReturnType<typeof createAdmissionRouteBoundary>, request: Request, context: SettingsRouteContext) {
    const selected = await selection(boundary, request, context);
    return selected.usable ? resolveSelectedTribe(boundary, selected.value) : selected;
  }

  /** @param boundary - This request's single validation/error owner. @param request - Original same-origin change request. @param context - Framework tenant params. @param schema - Own command schema. @returns The resolved change scope with its validated command, or its own safe response; composition opens only after every input passes. */
  async function openChange<Command>(boundary: ReturnType<typeof createAdmissionRouteBoundary>, request: Request, context: SettingsRouteContext, schema: z.ZodType<Command>) {
    if (!hasAllowedAdmissionOrigin(request)) return { usable: false as const, response: boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied)) };
    const selected = await selection(boundary, request, context);
    if (!selected.usable) return selected;
    const body = await boundary.readBody(schema);
    if (!body.usable) return body;
    const scope = await resolveSelectedTribe(boundary, selected.value);
    return scope.usable ? { ...scope, command: body.value } : scope;
  }

  return {
    /** @param request - Native current request. @param context - Framework tenant. @returns A current own frequency and capability hint without IDs or internal delivery cuts. */
    async readOwnPreference(request: Request, context: SettingsRouteContext): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_NOTIFICATION_SETTINGS_HTTP_OPERATION.preferenceRead });
      try {
        const scope = await openRead(boundary, request, context);
        if (!scope.usable) return scope.response;
        const result = await scope.services.preferences.read({ tribeId: scope.tribeId, requestId: scope.requestId }, { includeViewer: true });
        if (!result.ok) return boundary.failure(result.failure);
        if (result.value.preference.tribeId !== scope.tribeId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        return bindViewer(boundary.success(admissionNotificationPreferenceReadResultSchema, { preference: toAdmissionNotificationPreferenceView(result.value.preference), canConfigureEmail: result.value.canConfigureEmail }), result);
      } catch (error) { return boundary.unexpected(error); }
    },

    /** @param request - Explicit own mode/version request. @param context - Framework tenant. @returns A safe committed choice/no-op or explicit CAS rejection, without enabling a channel. */
    async changeOwnPreference(request: Request, context: SettingsRouteContext): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_NOTIFICATION_SETTINGS_HTTP_OPERATION.preferenceChange });
      try {
        const scope = await openChange(boundary, request, context, admissionNotificationPreferenceChangeSchema);
        if (!scope.usable) return scope.response;
        const result = await scope.services.preferences.change({ ...scope.command, tribeId: scope.tribeId, requestId: scope.requestId }, { includeViewer: true });
        if (!result.ok) return boundary.failure(result.failure);
        if (result.value.status !== ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected && result.value.preference.tribeId !== scope.tribeId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        const view = result.value.status === ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected
          ? { status: result.value.status, reason: result.value.reason }
          : { status: result.value.status, preference: toAdmissionNotificationPreferenceView(result.value.preference) };
        const schema = admissionNotificationPreferenceChangeResultSchema.refine((value) => value.status === ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected || value.preference.mode === scope.command.mode && value.preference.version === scope.command.expectedVersion + (value.status === ADMISSION_NOTIFICATION_PREFERENCE_STATUS.changed ? 1 : 0));
        return bindViewer(boundary.success(schema, view), result);
      } catch (error) { return boundary.unexpected(error); }
    },

    /** @param request - Current leader request. @param context - Framework tenant. @returns Read-only current settings without loading provider keys or creating the default row. */
    async readEmailSettings(request: Request, context: SettingsRouteContext): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_NOTIFICATION_SETTINGS_HTTP_OPERATION.emailRead });
      try {
        const scope = await openRead(boundary, request, context);
        if (!scope.usable) return scope.response;
        const result = await scope.services.email.read({ tribeId: scope.tribeId, requestId: scope.requestId }, { includeViewer: true });
        if (!result.ok) return boundary.failure(result.failure);
        if (result.value.tribeId !== scope.tribeId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        return bindViewer(boundary.success(admissionNotificationEmailSettingsViewSchema, toAdmissionNotificationEmailSettingsView(result.value)), result);
      } catch (error) { return boundary.unexpected(error); }
    },

    /** @param request - Confirmed original UUID/version/desired email configuration. @param context - Framework tenant. @returns Original ledger progress or historical terminal result, without dispatch or implicit GET. */
    async changeEmailSettings(request: Request, context: SettingsRouteContext): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_NOTIFICATION_SETTINGS_HTTP_OPERATION.emailChange });
      try {
        const scope = await openChange(boundary, request, context, admissionNotificationEmailSettingsCommandSchema);
        if (!scope.usable) return scope.response;
        const result = await scope.services.email.change({ ...scope.command, tribeId: scope.tribeId, requestId: scope.requestId }, { includeViewer: true });
        if (!result.ok) return boundary.failure(result.failure);
        if (result.value.state === OPERATION_STATE.completed && result.value.result.status !== ADMISSION_EMAIL_SETTINGS_STATUS.rejected && result.value.result.settings.tribeId !== scope.tribeId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        const view = toAdmissionNotificationEmailSettingsOperationView(result.value);
        const schema = admissionNotificationEmailSettingsOperationSchema.refine((value) => value.operationId === scope.command.operationId && (value.state === OPERATION_STATE.started || value.result.status === ADMISSION_EMAIL_SETTINGS_STATUS.rejected || value.result.settings.enabled === scope.command.enabled && value.result.settings.timeZone === scope.command.timeZone && value.result.settings.version === scope.command.expectedVersion + (value.result.status === ADMISSION_EMAIL_SETTINGS_STATUS.changed ? 1 : 0)));
        return bindViewer(boundary.success(schema, view, view.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok), result);
      } catch (error) { return boundary.unexpected(error); }
    },
  };
}
