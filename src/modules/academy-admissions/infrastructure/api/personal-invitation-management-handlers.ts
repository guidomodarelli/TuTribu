/** Adapts current leader administration and original commands without recovering token material. @module personal-invitation-management-handlers */
import "server-only";
import type { ManagePersonalInvitationsUseCases } from "../../application/use-cases/manage-personal-invitations-use-cases";
import { type AdmissionFailure, admissionFailure  } from "../../application/results/admission-errors";
import { personalInvitationCreationResultSchema, personalInvitationMutationOperationSchema } from "../../constants/personal-invitation-management-schemas";
import { personalInvitationPageSchema, personalInvitationManagementSchema, createPersonalInvitationHttpCreationSchema } from "../../constants/personal-invitation-http-schemas";
import { PERSONAL_INVITATION_HTTP_ACTION, PERSONAL_INVITATION_HTTP_OPERATION } from "../../constants/personal-invitation-http";
import { ADMISSION_INVITATION_PUBLIC_PATH_PREFIX } from "../../constants/admission-management-contract";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { PERSONAL_INVITATION_VIEWER_HEADER, personalInvitationViewerMetadataSchema } from "../../constants/personal-invitation-browser";
import { admissionTribeParamsSchema, admissionInvitationParamsSchema, admissionInvitationQuerySchema, admissionEmptyQuerySchema, personalInvitationCreateSchema, personalInvitationRenameSchema, personalInvitationRevokeSchema } from "./admission-request-schemas";

/** Native composition exposes only use cases and configured public origin, without provider or caller identity. */
export type PersonalInvitationManagementServices = { resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> }; invitations: Pick<ManagePersonalInvitationsUseCases, "list" | "read" | "create" | "rename" | "revoke">; publicOrigin: () => string };
/** Framework params select only native resource identities. */
type RouteContext = { params: Promise<{ slug: string; invitationId?: string }> };
/** Each route fixes its action; browser fields cannot select a different mutation. */
type PersonalInvitationAction = "list" | "read" | "create" | "rename" | "revoke";
type InvitationBoundary = ReturnType<typeof createAdmissionRouteBoundary>;
/** One validated route target: boundary, tribe slug, raw query and the invitation named by the path, if any. */
type InvitationTarget = { boundary: InvitationBoundary; slug: string; queryInput: Record<string, string>; invitationId: string | undefined };

/** @param response - Guarded own JSON. @param viewerId - Native actor that produced the actual result. @returns Scope metadata, never caller-selected identity or session material. */
function bindViewer(response: Response, viewerId: string): Response {
  response.headers.set(PERSONAL_INVITATION_VIEWER_HEADER, JSON.stringify(personalInvitationViewerMetadataSchema.parse({ viewerId })));
  return response;
}

/** @param response - Boundary, own mutation result, confirmed command identity/version and exact invitation. @returns Registered progress or the confirmed CAS result, else a safe failure. */
function respondToInvitationMutation({ boundary, result, command, invitationId }: { boundary: InvitationBoundary; result: Awaited<ReturnType<PersonalInvitationManagementServices["invitations"]["rename"]>>; command: { operationId: string; expectedVersion: number }; invitationId: string }): Response {
  if (!result.ok) return boundary.failure(result.failure);
  const parsed = personalInvitationMutationOperationSchema.safeParse(result.value);
  if (!parsed.success || parsed.data.operationId !== command.operationId || parsed.data.state === OPERATION_STATE.completed && (parsed.data.result.invitationId !== invitationId || parsed.data.result.created || parsed.data.result.version !== command.expectedVersion + (parsed.data.result.changed ? 1 : 0))) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
  return bindViewer(boundary.success(personalInvitationMutationOperationSchema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok), result.viewerId);
}

/** @param open - Native composition. @param boundary - Current request boundary. @param slug - Validated tribe slug. @returns The composed services and current tribe scope, or the routing failure response. */
async function openInvitationScope(open: () => Promise<PersonalInvitationManagementServices>, boundary: InvitationBoundary, slug: string): Promise<{ services: PersonalInvitationManagementServices; scope: { tribeId: string; requestId: string } } | { response: Response }> {
  const services = await open(), requestId = boundary.requestContext.requestId;
  const tribe = await services.resolveTribe.execute({ slug, requestId });
  if (!tribe.ok) return { response: boundary.failure(tribe.failure) };
  return { services, scope: { tribeId: tribe.value.tribeId, requestId } };
}

/** @param boundary - Current request boundary. @param request - Native own request. @param context - Framework params. @param action - Fixed route intent. @returns The validated route target, or the input failure response. */
async function readInvitationTarget(boundary: InvitationBoundary, request: Request, context: RouteContext, action: PersonalInvitationAction): Promise<{ target: InvitationTarget } | { response: Response }> {
  const detail = action === PERSONAL_INVITATION_HTTP_ACTION.read || action === PERSONAL_INVITATION_HTTP_ACTION.rename || action === PERSONAL_INVITATION_HTTP_ACTION.revoke;
  const params = boundary.input("params", detail ? admissionInvitationParamsSchema : admissionTribeParamsSchema, await context.params);
  if (!params.usable) return { response: params.response };
  return { target: { boundary, slug: params.value.slug, queryInput: Object.fromEntries(new URL(request.url).searchParams), invitationId: "invitationId" in params.value ? String(params.value.invitationId) : undefined } };
}

/** @param open - Native composition. @param target - Validated route target. @returns The initial URL once, or original metadata, after current leader and session checks. */
async function createInvitation(open: () => Promise<PersonalInvitationManagementServices>, { boundary, slug, queryInput }: InvitationTarget): Promise<Response> {
  const query = boundary.input("query", admissionEmptyQuerySchema, queryInput);
  if (!query.usable) return query.response;
  const body = await boundary.readBody(personalInvitationCreateSchema);
  if (!body.usable) return body.response;
  const opened = await openInvitationScope(open, boundary, slug);
  if ("response" in opened) return opened.response;
  const trustedOrigin = opened.services.publicOrigin(), schema = createPersonalInvitationHttpCreationSchema(trustedOrigin);
  const { recipient, acknowledgeNoAllowlist, expiresAt, ...intent } = body.value;
  const result = await opened.services.invitations.create({ ...opened.scope, ...intent, contactType: recipient.type, identity: recipient.value, ...(recipient.country ? { country: recipient.country } : {}), allowlistExemptionAcknowledged: acknowledgeNoAllowlist === true, ...(expiresAt === undefined ? {} : { expiresAt: expiresAt === null ? null : new Date(expiresAt) }) });
  if (!result.ok) return boundary.failure(result.failure);
  const parsed = personalInvitationCreationResultSchema.safeParse(result.value);
  if (!parsed.success || parsed.data.operationId !== intent.operationId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
  if (parsed.data.state === OPERATION_STATE.started) return bindViewer(boundary.success(schema, parsed.data, HTTP_STATUS.accepted), result.viewerId);
  const initialToken = parsed.data.replayed ? undefined : parsed.data.initialToken;
  const original = { state: parsed.data.state, operationId: parsed.data.operationId, replayed: parsed.data.replayed, result: parsed.data.result };
  const outcome = { ...original, ...(initialToken ? { invitationUrl: new URL(ADMISSION_INVITATION_PUBLIC_PATH_PREFIX + initialToken, trustedOrigin).href } : {}) };
  return bindViewer(boundary.success(schema, outcome, original.result.created && !original.replayed ? HTTP_STATUS.created : HTTP_STATUS.ok), result.viewerId);
}

/** @param open - Native composition after input/origin validation. @returns Current metadata and explicit original commands with closed DTOs. */
export function createPersonalInvitationManagementHandlers(open: () => Promise<PersonalInvitationManagementServices>) {
  /** @param request - Native own request. @param context - Framework params. @param action - Fixed route intent. @returns Private metadata or its original safe outcome; reads never write. */
  async function execute(request: Request, context: RouteContext, action: PersonalInvitationAction): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: PERSONAL_INVITATION_HTTP_OPERATION[action] });
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const routed = await readInvitationTarget(boundary, request, context, action);
      if ("response" in routed) return routed.response;
      const target = routed.target;
      switch (action) {
        case PERSONAL_INVITATION_HTTP_ACTION.list: return await list(target);
        case PERSONAL_INVITATION_HTTP_ACTION.read: return await read(target);
        case PERSONAL_INVITATION_HTTP_ACTION.create: return await createInvitation(open, target);
        case PERSONAL_INVITATION_HTTP_ACTION.rename: return await rename(target);
        case PERSONAL_INVITATION_HTTP_ACTION.revoke: return await revoke(target);
      }
    } catch (error) { return boundary.unexpected(error); }
  }

  /** @param target - Validated route target. @returns Current private metadata without token. */
  async function list({ boundary, slug, queryInput }: InvitationTarget): Promise<Response> {
    const query = boundary.input("query", admissionInvitationQuerySchema, queryInput);
    if (!query.usable) return query.response;
    const opened = await openInvitationScope(open, boundary, slug);
    if ("response" in opened) return opened.response;
    const result = await opened.services.invitations.list({ ...opened.scope, ...query.value });
    return result.ok ? bindViewer(boundary.success(personalInvitationPageSchema, result.value), result.viewerId) : boundary.failure(result.failure);
  }

  /** @param target - Validated route target. @returns Current metadata of the exact invitation. */
  async function read({ boundary, slug, queryInput, invitationId }: InvitationTarget): Promise<Response> {
    const query = boundary.input("query", admissionEmptyQuerySchema, queryInput);
    if (!query.usable) return query.response;
    const opened = await openInvitationScope(open, boundary, slug);
    if ("response" in opened) return opened.response;
    if (!invitationId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    const result = await opened.services.invitations.read({ ...opened.scope, invitationId });
    if (!result.ok) return boundary.failure(result.failure);
    if (result.value.id !== invitationId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    return bindViewer(boundary.success(personalInvitationManagementSchema, result.value), result.viewerId);
  }

  /** @param target - Validated route target. @returns Original minimal CAS result of the name edit. */
  async function rename({ boundary, slug, queryInput, invitationId }: InvitationTarget): Promise<Response> {
    const query = boundary.input("query", admissionEmptyQuerySchema, queryInput);
    if (!query.usable) return query.response;
    const body = await boundary.readBody(personalInvitationRenameSchema);
    if (!body.usable) return body.response;
    const opened = await openInvitationScope(open, boundary, slug);
    if ("response" in opened) return opened.response;
    if (!invitationId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    const result = await opened.services.invitations.rename({ ...opened.scope, invitationId, ...body.value });
    return respondToInvitationMutation({ boundary, result, command: body.value, invitationId });
  }

  /** @param target - Validated route target. @returns Original outcome of the withdrawal without silently changing the confirmed action. */
  async function revoke({ boundary, slug, queryInput, invitationId }: InvitationTarget): Promise<Response> {
    const query = boundary.input("query", admissionEmptyQuerySchema, queryInput);
    if (!query.usable) return query.response;
    const body = await boundary.readBody(personalInvitationRevokeSchema);
    if (!body.usable) return body.response;
    const opened = await openInvitationScope(open, boundary, slug);
    if ("response" in opened) return opened.response;
    if (!invitationId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    const result = await opened.services.invitations.revoke({ ...opened.scope, invitationId, operationId: body.value.operationId, confirmed: body.value.confirmed, expectedVersion: body.value.expectedVersion, internalReason: body.value.reason, revokeRedeemedAuthorization: body.value.revokeRedeemedAuthorization });
    return respondToInvitationMutation({ boundary, result, command: body.value, invitationId });
  }

  return {
    /** @param request - Own bounded query. @param context - Native tribe. @returns Current private metadata without token. */
    list: (request: Request, context: RouteContext) => execute(request, context, PERSONAL_INVITATION_HTTP_ACTION.list),
    /** @param request - Own empty query. @param context - Exact native resource. @returns Current metadata independent of original history. */
    read: (request: Request, context: RouteContext) => execute(request, context, PERSONAL_INVITATION_HTTP_ACTION.read),
    /** @param request - Confirmed recipient/restrictions proposal. @param context - Native tribe. @returns Initial URL once or original metadata after current leader and session checks. */
    create: (request: Request, context: RouteContext) => execute(request, context, PERSONAL_INVITATION_HTTP_ACTION.create),
    /** @param request - Confirmed observed-version name edit. @param context - Exact native resource. @returns Original minimal CAS result. */
    rename: (request: Request, context: RouteContext) => execute(request, context, PERSONAL_INVITATION_HTTP_ACTION.rename),
    /** @param request - Explicit observed-version withdrawal and reason. @param context - Exact native resource. @returns Original outcome without silently changing the confirmed action. */
    revoke: (request: Request, context: RouteContext) => execute(request, context, PERSONAL_INVITATION_HTTP_ACTION.revoke),
  };
}
