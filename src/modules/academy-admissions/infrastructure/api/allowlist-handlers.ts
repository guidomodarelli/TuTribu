/** Adapts leader-owned list reads and explicit commands through the existing guarded HTTP boundary. @module allowlist-handlers */
import "server-only";
import type { ManageAllowlistUseCases } from "../../application/use-cases/manage-allowlist-use-cases";
import { type AdmissionFailure, admissionFailure  } from "../../application/results/admission-errors";
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

/** Fixed diagnostic operation of each list action. */
const ALLOWLIST_HTTP_OPERATION = { list: ADMISSION_HTTP_OPERATION.allowlistList, read: ADMISSION_HTTP_OPERATION.allowlistRead, create: ADMISSION_HTTP_OPERATION.allowlistCreate, update: ADMISSION_HTTP_OPERATION.allowlistUpdate } as const;
type AllowlistAction = keyof typeof ALLOWLIST_HTTP_OPERATION;
type AllowlistBoundary = ReturnType<typeof createAdmissionRouteBoundary>;
/** One validated route target: boundary, tribe slug, raw query and the entry named by the path, if any. */
type AllowlistTarget = { boundary: AllowlistBoundary; slug: string; queryInput: Record<string, string>; entryId: string | undefined };

/** @param started - Whether only progress is registered. @param freshlyCreated - Whether this call created the entry. @returns Accepted for progress, created for a new entry, else OK. */
function allowlistOperationStatus(started: boolean, freshlyCreated: boolean) {
  if (started) return HTTP_STATUS.accepted;
  return freshlyCreated ? HTTP_STATUS.created : HTTP_STATUS.ok;
}

/** @param open - Native server composition after own input/origin validation. @returns List, detail, create and update handlers with no GET mutations. */
export function createAllowlistHandlers(open: () => Promise<AllowlistServices>) {
  /** @param request - Native own request. @param context - Framework params. @param action - Static operation selected by the route. @returns A guarded own page/entry/original outcome or safe catalogue failure. */
  async function execute(request: Request, context: RouteContext, action: AllowlistAction): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: ALLOWLIST_HTTP_OPERATION[action] });
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const params = boundary.input("params", action === "read" || action === "update" ? admissionAllowlistParamsSchema : admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const target: AllowlistTarget = { boundary, slug: params.value.slug, queryInput: Object.fromEntries(new URL(request.url).searchParams), entryId: "entryId" in params.value ? String(params.value.entryId) : undefined };
      if (action === "list") return await list(target);
      if (action === "read") return await read(target);
      return action === "create" ? await create(target) : await update(target);
    } catch (error) { return boundary.unexpected(error); }
  }

  /** @param boundary - Current request boundary. @param slug - Validated tribe slug. @returns The composed services and current tribe scope, or the routing failure response. */
  async function openScope(boundary: AllowlistBoundary, slug: string): Promise<{ services: AllowlistServices; scope: { tribeId: string; requestId: string } } | { response: Response }> {
    const services = await open(), requestId = boundary.requestContext.requestId;
    const tribe = await services.resolveTribe.execute({ slug, requestId });
    if (!tribe.ok) return { response: boundary.failure(tribe.failure) };
    return { services, scope: { tribeId: tribe.value.tribeId, requestId } };
  }

  /** @param target - Validated route target. @returns Current leader page without write. */
  async function list({ boundary, slug, queryInput }: AllowlistTarget): Promise<Response> {
    const query = boundary.input("query", admissionAllowlistQuerySchema, queryInput);
    if (!query.usable) return query.response;
    const opened = await openScope(boundary, slug);
    if ("response" in opened) return opened.response;
    const result = await opened.services.allowlist.list({ ...opened.scope, ...query.value });
    return result.ok ? boundary.success(allowlistPageSchema, result.value) : boundary.failure(result.failure);
  }

  /** @param target - Validated route target. @returns Current metadata of the exact entry. */
  async function read({ boundary, slug, queryInput, entryId }: AllowlistTarget): Promise<Response> {
    const query = boundary.input("query", admissionEmptyQuerySchema, queryInput);
    if (!query.usable) return query.response;
    const opened = await openScope(boundary, slug);
    if ("response" in opened) return opened.response;
    if (!entryId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    const result = await opened.services.allowlist.read({ ...opened.scope, entryId });
    if (!result.ok) return boundary.failure(result.failure);
    if (!result.value) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.resourceUnavailable));
    if (result.value.id !== entryId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    return boundary.success(allowlistEntrySchema, result.value);
  }

  /** @param target - Validated route target. @returns Version-one creation, original result or registered progress. */
  async function create({ boundary, slug, queryInput }: AllowlistTarget): Promise<Response> {
    const query = boundary.input("query", admissionEmptyQuerySchema, queryInput);
    if (!query.usable) return query.response;
    const body = await boundary.readBody(allowlistEntryCreateSchema);
    if (!body.usable) return body.response;
    const opened = await openScope(boundary, slug);
    if ("response" in opened) return opened.response;
    const result = await opened.services.allowlist.create({ ...opened.scope, ...body.value });
    if (!result.ok) return boundary.failure(result.failure);
    const schema = createAdmissionOperationStateSchema(allowlistMutationResultSchema), parsed = schema.safeParse(result.value);
    if (!parsed.success || parsed.data.operationId !== body.value.operationId || parsed.data.state === OPERATION_STATE.completed && !parsed.data.result.created && parsed.data.result.changed) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    return boundary.success(schema, parsed.data, allowlistOperationStatus(parsed.data.state === OPERATION_STATE.started, parsed.data.state === OPERATION_STATE.completed && parsed.data.result.created && !parsed.data.replayed));
  }

  /** @param target - Validated route target. @returns Minimal original CAS result without membership/binding effects. */
  async function update({ boundary, slug, queryInput, entryId }: AllowlistTarget): Promise<Response> {
    const query = boundary.input("query", admissionEmptyQuerySchema, queryInput);
    if (!query.usable) return query.response;
    const body = await boundary.readBody(allowlistEntryUpdateSchema);
    if (!body.usable) return body.response;
    const opened = await openScope(boundary, slug);
    if ("response" in opened) return opened.response;
    if (!entryId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    const { operationId, confirmed, expectedVersion, ...patch } = body.value;
    const result = await opened.services.allowlist.update({ ...opened.scope, entryId, operationId, confirmed, expectedVersion, patch });
    if (!result.ok) return boundary.failure(result.failure);
    const schema = createAdmissionOperationStateSchema(allowlistMutationResultSchema), parsed = schema.safeParse(result.value);
    if (!parsed.success || parsed.data.operationId !== operationId || parsed.data.state === OPERATION_STATE.completed && (parsed.data.result.entryId !== entryId || parsed.data.result.created || parsed.data.result.version !== expectedVersion + (parsed.data.result.changed ? 1 : 0))) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    return boundary.success(schema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
  }

  return {
    /** @param request - Own bounded query. @param context - Current tribe params. @returns Current leader metadata without write. */
    list: (request: Request, context: RouteContext) => execute(request, context, "list"),
    /** @param request - Exact own entry query. @param context - Current tribe/entry params. @returns Current metadata independent of an older replay. */
    read: (request: Request, context: RouteContext) => execute(request, context, "read"),
    /** @param request - Explicit canonical proposal. @param context - Current tribe params. @returns Version-one creation or original result after current leader and session checks. */
    create: (request: Request, context: RouteContext) => execute(request, context, "create"),
    /** @param request - Explicit observed-version edit. @param context - Current entry params. @returns Minimal original CAS result without membership/binding effects. */
    update: (request: Request, context: RouteContext) => execute(request, context, "update"),
  };
}
