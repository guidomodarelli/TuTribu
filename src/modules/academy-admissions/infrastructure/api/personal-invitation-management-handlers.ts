/** Adapts current leader administration and original commands without recovering token material. @module personal-invitation-management-handlers */
import "server-only";
import type { ManagePersonalInvitationsUseCases } from "../../application/use-cases/manage-personal-invitations-use-cases";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import { admissionFailure } from "../../application/results/admission-errors";
import { personalInvitationCreationResultSchema, personalInvitationMutationOperationSchema } from "../../constants/personal-invitation-management-schemas";
import { personalInvitationPageSchema, personalInvitationManagementSchema, createPersonalInvitationHttpCreationSchema } from "../../constants/personal-invitation-http-schemas";
import { PERSONAL_INVITATION_HTTP_ACTION, PERSONAL_INVITATION_HTTP_OPERATION } from "../../constants/personal-invitation-http";
import { ADMISSION_INVITATION_PUBLIC_PATH_PREFIX } from "../../constants/admission-management-contract";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { admissionTribeParamsSchema, admissionInvitationParamsSchema, admissionInvitationQuerySchema, admissionEmptyQuerySchema, personalInvitationCreateSchema, personalInvitationRenameSchema, personalInvitationRevokeSchema } from "./admission-request-schemas";

/** Native composition exposes only use cases and configured public origin, without provider or caller identity. */
export type PersonalInvitationManagementServices = { resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> }; invitations: Pick<ManagePersonalInvitationsUseCases, "list" | "read" | "create" | "rename" | "revoke">; publicOrigin: () => string };
/** Framework params select only native resource identities. */
type RouteContext = { params: Promise<{ slug: string; invitationId?: string }> };
/** Each route fixes its action; browser fields cannot select a different mutation. */
type PersonalInvitationAction = "list" | "read" | "create" | "rename" | "revoke";

/** @param open - Native composition after input/origin validation. @returns Current metadata and explicit original commands with closed DTOs. */
export function createPersonalInvitationManagementHandlers(open: () => Promise<PersonalInvitationManagementServices>) {
  /** @param request - Native own request. @param context - Framework params. @param action - Fixed route intent. @returns Private metadata or its original safe outcome; reads never write. */
  async function execute(request: Request, context: RouteContext, action: PersonalInvitationAction): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: PERSONAL_INVITATION_HTTP_OPERATION[action] });
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const detail = action === PERSONAL_INVITATION_HTTP_ACTION.read || action === PERSONAL_INVITATION_HTTP_ACTION.rename || action === PERSONAL_INVITATION_HTTP_ACTION.revoke;
      const params = boundary.input("params", detail ? admissionInvitationParamsSchema : admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const queryInput = Object.fromEntries(new URL(request.url).searchParams);
      const listQuery = action === PERSONAL_INVITATION_HTTP_ACTION.list ? boundary.input("query", admissionInvitationQuerySchema, queryInput) : null;
      if (listQuery && !listQuery.usable) return listQuery.response;
      const emptyQuery = action !== PERSONAL_INVITATION_HTTP_ACTION.list ? boundary.input("query", admissionEmptyQuerySchema, queryInput) : null;
      if (emptyQuery && !emptyQuery.usable) return emptyQuery.response;
      const createBody = action === PERSONAL_INVITATION_HTTP_ACTION.create ? await boundary.readBody(personalInvitationCreateSchema) : null;
      if (createBody && !createBody.usable) return createBody.response;
      const renameBody = action === PERSONAL_INVITATION_HTTP_ACTION.rename ? await boundary.readBody(personalInvitationRenameSchema) : null;
      if (renameBody && !renameBody.usable) return renameBody.response;
      const revokeBody = action === PERSONAL_INVITATION_HTTP_ACTION.revoke ? await boundary.readBody(personalInvitationRevokeSchema) : null;
      if (revokeBody && !revokeBody.usable) return revokeBody.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!tribe.ok) return boundary.failure(tribe.failure);
      const scope = { tribeId: tribe.value.tribeId, requestId }, invitationId = "invitationId" in params.value ? String(params.value.invitationId) : undefined;
      if (action === PERSONAL_INVITATION_HTTP_ACTION.list && listQuery?.usable) {
        const result = await services.invitations.list({ ...scope, ...listQuery.value });
        return result.ok ? boundary.success(personalInvitationPageSchema, result.value) : boundary.failure(result.failure);
      }
      if (action === PERSONAL_INVITATION_HTTP_ACTION.read && invitationId) {
        const result = await services.invitations.read({ ...scope, invitationId });
        if (!result.ok) return boundary.failure(result.failure);
        if (result.value.id !== invitationId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        return boundary.success(personalInvitationManagementSchema, result.value);
      }
      if (action === PERSONAL_INVITATION_HTTP_ACTION.create && createBody?.usable) {
        const trustedOrigin = services.publicOrigin(), schema = createPersonalInvitationHttpCreationSchema(trustedOrigin);
        const { recipient, acknowledgeNoAllowlist, expiresAt, ...intent } = createBody.value;
        const result = await services.invitations.create({ ...scope, ...intent, contactType: recipient.type, identity: recipient.value, ...(recipient.country ? { country: recipient.country } : {}), allowlistExemptionAcknowledged: acknowledgeNoAllowlist === true, ...(expiresAt === undefined ? {} : { expiresAt: expiresAt === null ? null : new Date(expiresAt) }) });
        if (!result.ok) return boundary.failure(result.failure);
        const parsed = personalInvitationCreationResultSchema.safeParse(result.value);
        if (!parsed.success || parsed.data.operationId !== intent.operationId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        if (parsed.data.state === OPERATION_STATE.started) return boundary.success(schema, parsed.data, HTTP_STATUS.accepted);
        const initialToken = parsed.data.replayed ? undefined : parsed.data.initialToken;
        const original = { state: parsed.data.state, operationId: parsed.data.operationId, replayed: parsed.data.replayed, result: parsed.data.result };
        const outcome = { ...original, ...(initialToken ? { invitationUrl: new URL(ADMISSION_INVITATION_PUBLIC_PATH_PREFIX + initialToken, trustedOrigin).href } : {}) };
        return boundary.success(schema, outcome, original.result.created && !original.replayed ? HTTP_STATUS.created : HTTP_STATUS.ok);
      }
      const command = renameBody?.usable ? renameBody.value : revokeBody?.usable ? revokeBody.value : null;
      if (command && invitationId) {
        const result = renameBody?.usable
          ? await services.invitations.rename({ ...scope, invitationId, ...renameBody.value })
          : revokeBody?.usable ? await services.invitations.revoke({ ...scope, invitationId, operationId: revokeBody.value.operationId, confirmed: revokeBody.value.confirmed, expectedVersion: revokeBody.value.expectedVersion, internalReason: revokeBody.value.reason, revokeRedeemedAuthorization: revokeBody.value.revokeRedeemedAuthorization }) : null;
        if (!result) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
        if (!result.ok) return boundary.failure(result.failure);
        const parsed = personalInvitationMutationOperationSchema.safeParse(result.value);
        if (!parsed.success || parsed.data.operationId !== command.operationId || parsed.data.state === OPERATION_STATE.completed && (parsed.data.result.invitationId !== invitationId || parsed.data.result.created || parsed.data.result.version !== command.expectedVersion + (parsed.data.result.changed ? 1 : 0))) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        return boundary.success(personalInvitationMutationOperationSchema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
      }
      return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
    } catch (error) { return boundary.unexpected(error); }
  }
  return {
    /** @param request - Own bounded query. @param context - Native tribe. @returns Current private metadata without token or mutation recency. */
    list: (request: Request, context: RouteContext) => execute(request, context, PERSONAL_INVITATION_HTTP_ACTION.list),
    /** @param request - Own empty query. @param context - Exact native resource. @returns Current metadata independent of original history. */
    read: (request: Request, context: RouteContext) => execute(request, context, PERSONAL_INVITATION_HTTP_ACTION.read),
    /** @param request - Confirmed recipient/restrictions proposal. @param context - Native tribe. @returns Initial URL once or original metadata after signed creation recency. */
    create: (request: Request, context: RouteContext) => execute(request, context, PERSONAL_INVITATION_HTTP_ACTION.create),
    /** @param request - Confirmed observed-version name edit. @param context - Exact native resource. @returns Original minimal CAS result. */
    rename: (request: Request, context: RouteContext) => execute(request, context, PERSONAL_INVITATION_HTTP_ACTION.rename),
    /** @param request - Explicit observed-version withdrawal and reason. @param context - Exact native resource. @returns Original outcome without silently changing the confirmed action. */
    revoke: (request: Request, context: RouteContext) => execute(request, context, PERSONAL_INVITATION_HTTP_ACTION.revoke),
  };
}
