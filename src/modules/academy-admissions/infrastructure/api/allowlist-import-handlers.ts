/** Adapts import use cases to private own HTTP resources. @module allowlist-import-handlers */
import "server-only";
import type { ImportAllowlistUseCases } from "../../application/use-cases/import-allowlist-use-cases";
import type { AllowlistServices } from "./allowlist-handlers";
import { admissionFailure } from "../../application/results/admission-errors";
import { allowlistImportSchema } from "../../application/results/admission-management-result-schemas";
import { allowlistImportReferenceSchema, allowlistImportConfirmationResultSchema } from "../../application/results/allowlist-import-operation-schemas";
import { createAdmissionOperationStateSchema } from "../../application/results/admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ALLOWLIST_IMPORT_HTTP_ACTION as ACTION, ALLOWLIST_IMPORT_HTTP_OPERATION as OPERATION, ALLOWLIST_IMPORT_CSV_HEADERS, ALLOWLIST_IMPORT_CSV_DOWNLOAD } from "../../constants/allowlist-import";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { attachRequestContextToResponse } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { admissionTribeParamsSchema, admissionImportParamsSchema, admissionEmptyQuerySchema, admissionImportPreviewSchema, admissionImportConfirmationSchema } from "./admission-request-schemas";
import { createAllowlistImportTemplate, renderAllowlistImportReport } from "./allowlist-import-report";
export type AllowlistImportServices = Pick<AllowlistServices, "resolveTribe"> & { imports: Pick<ImportAllowlistUseCases, "preview" | "read" | "confirm" | "templateAccess"> };
type RouteContext = { params: Promise<{ slug: string; importId?: string }> };
/** @param open - Native server-owned composition. @returns Explicit mutation and read-only file/query handlers. */
export function createAllowlistImportHandlers(open: () => Promise<AllowlistImportServices>) {
  /** @param request - Native same-origin request. @param context - Own runtime params. @param action - Server-selected static operation. @returns A guarded own DTO or authorized CSV, without any GET mutation. */
  async function execute(request: Request, context: RouteContext, action: typeof ACTION[keyof typeof ACTION]): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: OPERATION[action] });
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const detail = action === ACTION.read || action === ACTION.confirm || action === ACTION.report;
      const params = boundary.input("params", detail ? admissionImportParamsSchema : admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const previewBody = action === ACTION.preview ? await boundary.readBody(admissionImportPreviewSchema) : null;
      if (previewBody && !previewBody.usable) return previewBody.response;
      const confirmBody = action === ACTION.confirm ? await boundary.readBody(admissionImportConfirmationSchema) : null;
      if (confirmBody && !confirmBody.usable) return confirmBody.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!tribe.ok) return boundary.failure(tribe.failure);
      const scope = { tribeId: tribe.value.tribeId, requestId }, importId = "importId" in params.value ? String(params.value.importId) : undefined;
      if (action === ACTION.template) {
        const allowed = await services.imports.templateAccess(scope);
        if (!allowed.ok) return boundary.failure(allowed.failure);
        return attachRequestContextToResponse(new Response(createAllowlistImportTemplate(), { headers: { ...ALLOWLIST_IMPORT_CSV_HEADERS, "content-disposition": ALLOWLIST_IMPORT_CSV_DOWNLOAD.template } }), boundary.requestContext);
      }
      if (action === ACTION.preview && previewBody?.usable) {
        const result = await services.imports.preview({ ...scope, ...previewBody.value });
        if (!result.ok) return boundary.failure(result.failure);
        const schema = createAdmissionOperationStateSchema(allowlistImportReferenceSchema), parsed = schema.safeParse(result.value);
        if (!parsed.success || parsed.data.operationId !== previewBody.value.operationId || parsed.data.state === OPERATION_STATE.completed && parsed.data.result.sourceVersion !== 1) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        return boundary.success(schema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : parsed.data.replayed ? HTTP_STATUS.ok : HTTP_STATUS.created);
      }
      if (action === ACTION.confirm && confirmBody?.usable && importId) {
        const result = await services.imports.confirm({ ...scope, ...confirmBody.value, importId });
        if (!result.ok) return boundary.failure(result.failure);
        const schema = createAdmissionOperationStateSchema(allowlistImportConfirmationResultSchema), parsed = schema.safeParse(result.value);
        if (!parsed.success || parsed.data.operationId !== confirmBody.value.operationId || parsed.data.state === OPERATION_STATE.completed && (parsed.data.result.importId !== importId || parsed.data.result.sourceVersion < confirmBody.value.expectedVersion)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        return boundary.success(schema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
      }
      if ((action === ACTION.read || action === ACTION.report) && importId) {
        const result = await services.imports.read({ ...scope, importId });
        if (!result.ok) return boundary.failure(result.failure);
        if (!result.value) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.resourceUnavailable));
        const projected = allowlistImportSchema.safeParse(result.value);
        if (!projected.success || projected.data.importId !== importId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        if (action === ACTION.read) return boundary.success(allowlistImportSchema, projected.data);
        return attachRequestContextToResponse(new Response(renderAllowlistImportReport(projected.data), { headers: { ...ALLOWLIST_IMPORT_CSV_HEADERS, "content-disposition": ALLOWLIST_IMPORT_CSV_DOWNLOAD.report } }), boundary.requestContext);
      }
      return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    } catch (error) { return boundary.unexpected(error); }
  }
  return {
    preview: (request: Request, context: RouteContext) => execute(request, context, ACTION.preview),
    read: (request: Request, context: RouteContext) => execute(request, context, ACTION.read),
    confirm: (request: Request, context: RouteContext) => execute(request, context, ACTION.confirm),
    report: (request: Request, context: RouteContext) => execute(request, context, ACTION.report),
    template: (request: Request, context: RouteContext) => execute(request, context, ACTION.template),
  };
}
