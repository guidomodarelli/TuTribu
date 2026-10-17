/** Protects the native maintenance route before composition and validates its own public response once. @module admission-messaging-maintenance-handler */
import "server-only";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createOwnJsonRouteBoundary, type OwnHttpDiagnostic } from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";
import type { RequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import type { RunAdmissionMessagingMaintenanceUseCase } from "../../application/use-cases/run-admission-messaging-maintenance-use-case";
import { ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE, ADMISSION_MESSAGING_MAINTENANCE_LOG, ADMISSION_MESSAGING_MAINTENANCE_MESSAGE, ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS } from "../../constants/admission-messaging-maintenance";
import { admissionMessagingMaintenanceErrorSchema, admissionMessagingMaintenanceInputSchema, admissionMessagingMaintenanceResponseSchema } from "./dto/admission-messaging-maintenance-schemas";

/** Contains only own machine-code failures; raw causes stay at the private boundary. */
type MaintenanceHttpFailure = { readonly code: "maintenance_unauthorized" | "maintenance_invalid_input" | "maintenance_unavailable" };

/** @param dependencies - Actual native bearer and lazy server composition; diagnostics contain only closed own fields. @returns An authenticated handler without implicit provider, account or database access. */
export function createAdmissionMessagingMaintenanceHandler(dependencies: { authorize: (request: Request) => boolean | Promise<boolean>; create: (request: Request, context: RequestContext) => Promise<{ useCases: { runMaintenance: Pick<RunAdmissionMessagingMaintenanceUseCase, "execute"> } }>; diagnostics?: (diagnostic: OwnHttpDiagnostic) => void }) {
  return async (request: Request): Promise<Response> => {
    const boundary = createOwnJsonRouteBoundary<MaintenanceHttpFailure, { code: MaintenanceHttpFailure["code"]; message: string; requestId: string }>({ request, feature: ADMISSION_MESSAGING_MAINTENANCE_LOG.feature, operation: ADMISSION_MESSAGING_MAINTENANCE_LOG.operation, errorSchema: admissionMessagingMaintenanceErrorSchema, invalidInput: () => ({ code: ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.invalidInput }), unusableContract: () => ({ code: ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.unavailable }), unexpectedFailure: () => ({ code: ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.unavailable }), diagnostics: dependencies.diagnostics,
      projectFailure: (failure, requestId) => failure.code === ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.unauthorized ? { status: HTTP_STATUS.unauthorized, body: { code: failure.code, message: ADMISSION_MESSAGING_MAINTENANCE_MESSAGE.unauthorized, requestId } } : failure.code === ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.invalidInput ? { status: HTTP_STATUS.badRequest, body: { code: failure.code, message: ADMISSION_MESSAGING_MAINTENANCE_MESSAGE.invalidInput, requestId } } : { status: HTTP_STATUS.serviceUnavailable, body: { code: failure.code, message: ADMISSION_MESSAGING_MAINTENANCE_MESSAGE.unavailable, requestId } },
    });
    try {
      if (!await dependencies.authorize(request)) return boundary.failure({ code: ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.unauthorized });
      const input = boundary.input("query", admissionMessagingMaintenanceInputSchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!input.usable) return input.response;
      const maintenance = await dependencies.create(request, boundary.requestContext);
      const result = await maintenance.useCases.runMaintenance.execute();
      if (!await dependencies.authorize(request)) return boundary.failure({ code: ADMISSION_MESSAGING_MAINTENANCE_HTTP_CODE.unauthorized });
      const status = result.status === ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.completed ? HTTP_STATUS.ok : result.status === ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.busy ? HTTP_STATUS.accepted : HTTP_STATUS.serviceUnavailable;
      return boundary.success(admissionMessagingMaintenanceResponseSchema, { ...result, message: ADMISSION_MESSAGING_MAINTENANCE_MESSAGE[result.status], requestId: boundary.requestContext.requestId }, status);
    } catch (error) { return boundary.unexpected(error); }
  };
}
