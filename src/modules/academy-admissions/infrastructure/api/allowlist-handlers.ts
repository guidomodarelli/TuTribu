/** Adapts leader-owned list reads and explicit commands through the existing guarded HTTP boundary. @module allowlist-handlers */
import "server-only";
import type { ManageAllowlistUseCases } from "../../application/use-cases/manage-allowlist-use-cases";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import { admissionFailure } from "../../application/results/admission-errors";
import { allowlistPageSchema } from "../../application/results/allowlist-query-schemas";
import { allowlistEntrySchema } from "../../application/results/admission-public-result-schemas";
import { allowlistMutationResultSchema } from "../../application/results/allowlist-mutation-schemas";
import { createAdmissionOperationStateSchema } from "../../application/results/admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { admissionTribeParamsSchema, admissionAllowlistParamsSchema, admissionAllowlistQuerySchema, admissionEmptyQuerySchema, allowlistEntryCreateSchema, allowlistEntryUpdateSchema } from "./admission-request-schemas";

/** Native composition exposes use cases only, without caller identity or storage implementations. */
export type AllowlistServices = { resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> }; allowlist: Pick<ManageAllowlistUseCases, "list" | "read" | "create" | "update"> };
type RouteContext = { params: Promise<{ slug: string; entryId?: string }> };

/** @param open - Native server composition after own input/origin validation. @returns List, detail, create and update handlers with no GET mutations. */
export function createAllowlistHandlers(open: () => Promise<AllowlistServices>) {
  /** @param request - Native own request. @param context - Framework params. @param action - Static operation selected by the route. @returns A guarded own page/entry/original outcome or safe catalogue failure. */
  async function execute(request: Request, context: RouteContext, action: "list" | "read" | "create" | "update"): Promise<Response> {
    const operation = action === "list" ? ADMISSION_HTTP_OPERATION.allowlistList : action === "read" ? ADMISSION_HTTP_OPERATION.allowlistRead : action === "create" ? ADMISSION_HTTP_OPERATION.allowlistCreate : ADMISSION_HTTP_OPERATION.allowlistUpdate;
    const boundary = createAdmissionRouteBoundary({ request, operation });
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const params = boundary.input("params", action === "read" || action === "update" ? admissionAllowlistParamsSchema : admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const queryInput = Object.fromEntries(new URL(request.url).searchParams);
      const listQuery = action === "list" ? boundary.input("query", admissionAllowlistQuerySchema, queryInput) : null;
      if (listQuery && !listQuery.usable) return listQuery.response;
      const emptyQuery = action !== "list" ? boundary.input("query", admissionEmptyQuerySchema, queryInput) : null;
      if (emptyQuery && !emptyQuery.usable) return emptyQuery.response;
      const createBody = action === "create" ? await boundary.readBody(allowlistEntryCreateSchema) : null;
      if (createBody && !createBody.usable) return createBody.response;
      const updateBody = action === "update" ? await boundary.readBody(allowlistEntryUpdateSchema) : null;
      if (updateBody && !updateBody.usable) return updateBody.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!tribe.ok) return boundary.failure(tribe.failure);
      const scope = { tribeId: tribe.value.tribeId, requestId }, entryId = "entryId" in params.value ? String(params.value.entryId) : undefined;
      if (action === "list" && listQuery?.usable) {
        const result = await services.allowlist.list({ ...scope, ...listQuery.value });
        return result.ok ? boundary.success(allowlistPageSchema, result.value) : boundary.failure(result.failure);
      }
      if (action === "read") {
        if (!entryId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
        const result = await services.allowlist.read({ ...scope, entryId });
        if (!result.ok) return boundary.failure(result.failure);
        if (!result.value) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.resourceUnavailable));
        if (result.value.id !== entryId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        return boundary.success(allowlistEntrySchema, result.value);
      }
      if (action === "create" && createBody?.usable) {
        const result = await services.allowlist.create({ ...scope, ...createBody.value });
        if (!result.ok) return boundary.failure(result.failure);
        const schema = createAdmissionOperationStateSchema(allowlistMutationResultSchema), parsed = schema.safeParse(result.value);
        if (!parsed.success || parsed.data.operationId !== createBody.value.operationId || parsed.data.state === OPERATION_STATE.completed && !parsed.data.result.created && parsed.data.result.changed) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        return boundary.success(schema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : parsed.data.result.created && !parsed.data.replayed ? HTTP_STATUS.created : HTTP_STATUS.ok);
      }
      if (action === "update" && updateBody?.usable && entryId) {
        const { operationId, confirmed, expectedVersion, ...patch } = updateBody.value;
        const result = await services.allowlist.update({ ...scope, entryId, operationId, confirmed, expectedVersion, patch });
        if (!result.ok) return boundary.failure(result.failure);
        const schema = createAdmissionOperationStateSchema(allowlistMutationResultSchema), parsed = schema.safeParse(result.value);
        if (!parsed.success || parsed.data.operationId !== operationId || parsed.data.state === OPERATION_STATE.completed && (parsed.data.result.entryId !== entryId || parsed.data.result.created || parsed.data.result.version !== expectedVersion + (parsed.data.result.changed ? 1 : 0))) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        return boundary.success(schema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
      }
      return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    } catch (error) { return boundary.unexpected(error); }
  }
  return {
    /** @param request - Own bounded query. @param context - Current tribe params. @returns Current leader metadata without write or recency demand. */
    list: (request: Request, context: RouteContext) => execute(request, context, "list"),
    /** @param request - Exact own entry query. @param context - Current tribe/entry params. @returns Current metadata independent of an older replay. */
    read: (request: Request, context: RouteContext) => execute(request, context, "read"),
    /** @param request - Explicit canonical proposal. @param context - Current tribe params. @returns Version-one creation or original result after exact global recency. */
    create: (request: Request, context: RouteContext) => execute(request, context, "create"),
    /** @param request - Explicit observed-version edit. @param context - Current entry params. @returns Minimal original CAS result without membership/binding effects. */
    update: (request: Request, context: RouteContext) => execute(request, context, "update"),
  };
}
