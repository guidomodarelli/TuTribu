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
type ImportBoundary = ReturnType<typeof createAdmissionRouteBoundary>;
/** One validated route target: boundary, tribe slug and the import named by the path, if any. */
type ImportTarget = { boundary: ImportBoundary; slug: string; importId: string | undefined };

/** @param started - Whether only progress is registered. @param replayed - Whether the original was already completed. @returns Accepted for progress, OK for a replay, else created. */
function previewStatus(started: boolean, replayed: boolean) {
  if (started) return HTTP_STATUS.accepted;
  return replayed ? HTTP_STATUS.ok : HTTP_STATUS.created;
}

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
      const target: ImportTarget = { boundary, slug: params.value.slug, importId: "importId" in params.value ? String(params.value.importId) : undefined };
      if (action === ACTION.template) return await template(target);
      if (action === ACTION.preview) return await preview(target);
      if (action === ACTION.confirm) return await confirm(target);
      return await readImport(target, action === ACTION.report);
    } catch (error) { return boundary.unexpected(error); }
  }

  /** @param boundary - Current request boundary. @param slug - Validated tribe slug. @returns The composed services and current tribe scope, or the routing failure response. */
  async function openScope(boundary: ImportBoundary, slug: string): Promise<{ services: AllowlistImportServices; scope: { tribeId: string; requestId: string } } | { response: Response }> {
    const services = await open(), requestId = boundary.requestContext.requestId;
    const tribe = await services.resolveTribe.execute({ slug, requestId });
    if (!tribe.ok) return { response: boundary.failure(tribe.failure) };
    return { services, scope: { tribeId: tribe.value.tribeId, requestId } };
  }

  /** @param target - Validated route target. @returns The authorized empty CSV template. */
  async function template({ boundary, slug }: ImportTarget): Promise<Response> {
    const opened = await openScope(boundary, slug);
    if ("response" in opened) return opened.response;
    const allowed = await opened.services.imports.templateAccess(opened.scope);
    if (!allowed.ok) return boundary.failure(allowed.failure);
    return attachRequestContextToResponse(new Response(createAllowlistImportTemplate(), { headers: { ...ALLOWLIST_IMPORT_CSV_HEADERS, "content-disposition": ALLOWLIST_IMPORT_CSV_DOWNLOAD.template } }), boundary.requestContext);
  }

  /** @param target - Validated route target. @returns The version-one preview reference, its replay or registered progress. */
  async function preview({ boundary, slug }: ImportTarget): Promise<Response> {
    const body = await boundary.readBody(admissionImportPreviewSchema);
    if (!body.usable) return body.response;
    const opened = await openScope(boundary, slug);
    if ("response" in opened) return opened.response;
    const result = await opened.services.imports.preview({ ...opened.scope, ...body.value });
    if (!result.ok) return boundary.failure(result.failure);
    const schema = createAdmissionOperationStateSchema(allowlistImportReferenceSchema), parsed = schema.safeParse(result.value);
    if (!parsed.success || parsed.data.operationId !== body.value.operationId || parsed.data.state === OPERATION_STATE.completed && parsed.data.result.sourceVersion !== 1) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    return boundary.success(schema, parsed.data, previewStatus(parsed.data.state === OPERATION_STATE.started, parsed.data.state === OPERATION_STATE.completed && parsed.data.replayed));
  }

  /** @param target - Validated route target. @returns The original confirmation of the exact import or registered progress. */
  async function confirm({ boundary, slug, importId }: ImportTarget): Promise<Response> {
    const body = await boundary.readBody(admissionImportConfirmationSchema);
    if (!body.usable) return body.response;
    const opened = await openScope(boundary, slug);
    if ("response" in opened) return opened.response;
    if (!importId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    const result = await opened.services.imports.confirm({ ...opened.scope, ...body.value, importId });
    if (!result.ok) return boundary.failure(result.failure);
    const schema = createAdmissionOperationStateSchema(allowlistImportConfirmationResultSchema), parsed = schema.safeParse(result.value);
    if (!parsed.success || parsed.data.operationId !== body.value.operationId || parsed.data.state === OPERATION_STATE.completed && (parsed.data.result.importId !== importId || parsed.data.result.sourceVersion < body.value.expectedVersion)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    return boundary.success(schema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
  }

  /** @param target - Validated route target. @param report - Whether to render the CSV report instead of the JSON view. @returns The exact own import view or its report. */
  async function readImport({ boundary, slug, importId }: ImportTarget, report: boolean): Promise<Response> {
    const opened = await openScope(boundary, slug);
    if ("response" in opened) return opened.response;
    if (!importId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    const result = await opened.services.imports.read({ ...opened.scope, importId });
    if (!result.ok) return boundary.failure(result.failure);
    if (!result.value) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.resourceUnavailable));
    const projected = allowlistImportSchema.safeParse(result.value);
    if (!projected.success || projected.data.importId !== importId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    if (!report) return boundary.success(allowlistImportSchema, projected.data);
    return attachRequestContextToResponse(new Response(renderAllowlistImportReport(projected.data), { headers: { ...ALLOWLIST_IMPORT_CSV_HEADERS, "content-disposition": ALLOWLIST_IMPORT_CSV_DOWNLOAD.report } }), boundary.requestContext);
  }

  return {
    preview: (request: Request, context: RouteContext) => execute(request, context, ACTION.preview),
    read: (request: Request, context: RouteContext) => execute(request, context, ACTION.read),
    confirm: (request: Request, context: RouteContext) => execute(request, context, ACTION.confirm),
    report: (request: Request, context: RouteContext) => execute(request, context, ACTION.report),
    template: (request: Request, context: RouteContext) => execute(request, context, ACTION.template),
  };
}
