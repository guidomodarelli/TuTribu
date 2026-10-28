/** Protects the native maintenance route before composition and validates its own public response once. @module admission-messaging-maintenance-handler */
import "server-only";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createOwnJsonRouteBoundary, type OwnHttpDiagnostic } from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";
import type { RequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import type { RunAdmissionMessagingMaintenanceUseCase } from "../../application/use-cases/run-admission-messaging-maintenance-use-case";
import { ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE, ADMISSION_MESSAGING_MAINTENANCE_LOG, ADMISSION_MESSAGING_MAINTENANCE_MESSAGE, ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS } from "../../constants/admission-messaging-maintenance";
import { admissionMessagingMaintenanceErrorSchema, admissionMessagingMaintenanceInputSchema, admissionMessagingMaintenanceResponseSchema } from "./dto/admission-messaging-maintenance-schemas";
import { ADMISSION_MAINTENANCE_TRIGGER } from "../../constants/admission-maintenance-trigger.mjs";
import { admissionMaintenanceMadeProgress } from "../../application/use-cases/admission-messaging-maintenance-state";

/** Contains only own machine-code failures; raw causes stay at the private boundary. */
type MaintenanceHttpFailure = { readonly code: "maintenance_unauthorized" | "maintenance_invalid_input" | "maintenance_unavailable" };

/** @param failure - Closed own failure. @param requestId - Server correlation. @returns Its HTTP status and safe body. */
function projectMaintenanceFailure(failure: MaintenanceHttpFailure, requestId: string) {
  if (failure.code === ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.unauthorized) return { status: HTTP_STATUS.unauthorized, body: { code: failure.code, message: ADMISSION_MESSAGING_MAINTENANCE_MESSAGE.unauthorized, requestId } };
  if (failure.code === ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.invalidInput) return { status: HTTP_STATUS.badRequest, body: { code: failure.code, message: ADMISSION_MESSAGING_MAINTENANCE_MESSAGE.invalidInput, requestId } };
  return { status: HTTP_STATUS.serviceUnavailable, body: { code: failure.code, message: ADMISSION_MESSAGING_MAINTENANCE_MESSAGE.unavailable, requestId } };
}

/**
 * A run that only ran out of its own budget after recording confirmed progress is a successful bounded invocation for the trigger;
 * its body still says "incomplete", and health only advances with complete runs.
 * @param result - Published bounded run.
 * @returns Success, busy, or unavailable for the trigger.
 */
function maintenanceHttpStatus(result: Awaited<ReturnType<RunAdmissionMessagingMaintenanceUseCase["execute"]>>): number {
  if (result.status === ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.completed || admissionMaintenanceMadeProgress(result)) return ADMISSION_MAINTENANCE_TRIGGER.completedHttpStatus;
  return result.status === ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.busy ? ADMISSION_MAINTENANCE_TRIGGER.busyHttpStatus : HTTP_STATUS.serviceUnavailable;
}

/** @param dependencies - Actual native bearer and lazy server composition; diagnostics contain only closed own fields. @returns An authenticated handler without implicit provider, account or database access. */
export function createAdmissionMessagingMaintenanceHandler(dependencies: { authorize: (request: Request) => boolean | Promise<boolean>; create: (request: Request, context: RequestContext) => Promise<{ useCases: { runMaintenance: Pick<RunAdmissionMessagingMaintenanceUseCase, "execute"> } }>; diagnostics?: (diagnostic: OwnHttpDiagnostic) => void }) {
  return async (request: Request): Promise<Response> => {
    const boundary = createOwnJsonRouteBoundary<MaintenanceHttpFailure, { code: MaintenanceHttpFailure["code"]; message: string; requestId: string }>({ request, feature: ADMISSION_MESSAGING_MAINTENANCE_LOG.feature, operation: ADMISSION_MESSAGING_MAINTENANCE_LOG.operation, errorSchema: admissionMessagingMaintenanceErrorSchema, invalidInput: () => ({ code: ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.invalidInput }), unusableContract: () => ({ code: ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.unavailable }), unexpectedFailure: () => ({ code: ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.unavailable }), diagnostics: dependencies.diagnostics,
      projectFailure: projectMaintenanceFailure,
    });
    try {
      if (!await dependencies.authorize(request)) return boundary.failure({ code: ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.unauthorized });
      const input = boundary.input("query", admissionMessagingMaintenanceInputSchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!input.usable) return input.response;
      const maintenance = await dependencies.create(request, boundary.requestContext);
      const result = await maintenance.useCases.runMaintenance.execute();
      if (!await dependencies.authorize(request)) return boundary.failure({ code: ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.unauthorized });
      const status = maintenanceHttpStatus(result);
      return boundary.success(admissionMessagingMaintenanceResponseSchema, { ...result, message: ADMISSION_MESSAGING_MAINTENANCE_MESSAGE[result.status], requestId: boundary.requestContext.requestId }, status);
    } catch (error) { return boundary.unexpected(error); }
  };
}
