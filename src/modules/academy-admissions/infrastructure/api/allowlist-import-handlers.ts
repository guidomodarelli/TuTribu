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
import { type AdmissionRouteBoundary, readAdmissionRouteInput, openAdmissionTribeScope, readAdmissionBodyInTribeScope } from "./admission-route-steps";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { admissionTribeParamsSchema, admissionImportParamsSchema, admissionEmptyQuerySchema, admissionImportPreviewSchema, admissionImportConfirmationSchema } from "./admission-request-schemas";
import { createAllowlistImportTemplate, renderAllowlistImportReport } from "./allowlist-import-report";
export type AllowlistImportServices = Pick<AllowlistServices, "resolveTribe"> & { imports: Pick<ImportAllowlistUseCases, "preview" | "read" | "confirm" | "templateAccess"> };
type RouteContext = { params: Promise<{ slug: string; importId?: string }> };
/** One validated route target: boundary, tribe slug and the import named by the path, if any. */
type ImportTarget = { boundary: AdmissionRouteBoundary; slug: string; importId: string | undefined };

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
      const input = await readAdmissionRouteInput(boundary, { request, params: context.params }, { params: detail ? admissionImportParamsSchema : admissionTribeParamsSchema, query: admissionEmptyQuerySchema });
      if ("response" in input) return input.response;
      const { params } = input;
      const target: ImportTarget = { boundary, slug: params.slug, importId: "importId" in params ? String(params.importId) : undefined };
      if (action === ACTION.template) return await template(target);
      if (action === ACTION.preview) return await preview(target);
      if (action === ACTION.confirm) return await confirm(target);
      return await readImport(target, action === ACTION.report);
    } catch (error) { return boundary.unexpected(error); }
  }

  /** @param target - Validated route target. @returns The authorized empty CSV template. */
  async function template({ boundary, slug }: ImportTarget): Promise<Response> {
    const opened = await openAdmissionTribeScope(boundary, open, slug);
    if ("response" in opened) return opened.response;
    const allowed = await opened.services.imports.templateAccess(opened.scope);
    if (!allowed.ok) return boundary.failure(allowed.failure);
    return attachRequestContextToResponse(new Response(createAllowlistImportTemplate(), { headers: { ...ALLOWLIST_IMPORT_CSV_HEADERS, "content-disposition": ALLOWLIST_IMPORT_CSV_DOWNLOAD.template } }), boundary.requestContext);
  }

  /** @param target - Validated route target. @returns The version-one preview reference, its replay or registered progress. */
  async function preview({ boundary, slug }: ImportTarget): Promise<Response> {
    const command = await readAdmissionBodyInTribeScope(boundary, admissionImportPreviewSchema, open, slug);
    if ("response" in command) return command.response;
    const result = await command.services.imports.preview({ ...command.scope, ...command.body });
    if (!result.ok) return boundary.failure(result.failure);
    const schema = createAdmissionOperationStateSchema(allowlistImportReferenceSchema), parsed = schema.safeParse(result.value);
    if (!parsed.success || parsed.data.operationId !== command.body.operationId || parsed.data.state === OPERATION_STATE.completed && parsed.data.result.sourceVersion !== 1) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    return boundary.success(schema, parsed.data, previewStatus(parsed.data.state === OPERATION_STATE.started, parsed.data.state === OPERATION_STATE.completed && parsed.data.replayed));
  }

  /** @param target - Validated route target. @returns The original confirmation of the exact import or registered progress. */
  async function confirm({ boundary, slug, importId }: ImportTarget): Promise<Response> {
    const command = await readAdmissionBodyInTribeScope(boundary, admissionImportConfirmationSchema, open, slug);
    if ("response" in command) return command.response;
    if (!importId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    const { body } = command;
    const result = await command.services.imports.confirm({ ...command.scope, ...body, importId });
    if (!result.ok) return boundary.failure(result.failure);
    const schema = createAdmissionOperationStateSchema(allowlistImportConfirmationResultSchema), parsed = schema.safeParse(result.value);
    if (!parsed.success || parsed.data.operationId !== body.operationId || parsed.data.state === OPERATION_STATE.completed && (parsed.data.result.importId !== importId || parsed.data.result.sourceVersion < body.expectedVersion)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    return boundary.success(schema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
  }

  /** @param target - Validated route target. @param report - Whether to render the CSV report instead of the JSON view. @returns The exact own import view or its report. */
  async function readImport({ boundary, slug, importId }: ImportTarget, report: boolean): Promise<Response> {
    const opened = await openAdmissionTribeScope(boundary, open, slug);
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
