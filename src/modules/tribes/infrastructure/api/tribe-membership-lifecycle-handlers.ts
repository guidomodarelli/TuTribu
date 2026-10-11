/** Serves confirmed membership changes and original recovery through one own JSON boundary. @module tribe-membership-lifecycle-handlers */
import "server-only";
import { createOwnJsonRouteBoundary } from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";
import { hasAllowedRequestOrigin } from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import type { ManageTribeMembershipUseCases } from "../../application/use-cases/manage-tribe-membership-use-cases";
import { TribeMembershipLifecycleError } from "../../domain/errors/tribe-membership-lifecycle-error";
import { TRIBE_MEMBERSHIP_LIFECYCLE_ERROR } from "../../constants/tribe-membership-lifecycle";
import { TRIBE_MEMBERSHIP_LIFECYCLE_HTTP_FEATURE, TRIBE_MEMBERSHIP_LIFECYCLE_HTTP_OPERATION, TRIBE_MEMBERSHIP_LIFECYCLE_HTTP_STATUS, TRIBE_MEMBERSHIP_LIFECYCLE_MESSAGES, tribeMembershipLifecycleErrorSchema, tribeMembershipLifecycleInputSchema, tribeMembershipLifecycleOperationSchema, tribeMembershipLifecycleParamsSchema, tribeMembershipLifecycleQuerySchema, tribeMembershipLifecycleRecoverySchema } from "../../constants/tribe-membership-lifecycle-http";

/** Framework composition supplies native identity and the owning use cases; the body supplies no authority. */
type MembershipServices = { membership: Pick<ManageTribeMembershipUseCases, "change" | "recover">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute"> };

/** @param open - Native request composition. @returns Explicit change and recovery handlers with no-store/no-referrer public DTOs. */
export function createTribeMembershipLifecycleHandlers(open: () => Promise<MembershipServices>) {
  /** @param request - Native request. @param context - Framework URL scope. @param recovery - Fixed handler intent, never a browser flag. @returns One guarded own result without raw private failure details. */
  async function execute(request: Request, context: { params: Promise<{ slug: string }> }, recovery: boolean): Promise<Response> {
    const boundary = createOwnJsonRouteBoundary({
      request, feature: TRIBE_MEMBERSHIP_LIFECYCLE_HTTP_FEATURE, operation: recovery ? TRIBE_MEMBERSHIP_LIFECYCLE_HTTP_OPERATION.recover : TRIBE_MEMBERSHIP_LIFECYCLE_HTTP_OPERATION.change,
      errorSchema: tribeMembershipLifecycleErrorSchema,
      invalidInput: () => new TribeMembershipLifecycleError(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.invalidInput),
      unusableContract: () => new TribeMembershipLifecycleError(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.publicContractUnusable),
      unexpectedFailure: (cause) => new TribeMembershipLifecycleError(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.unexpectedFailure, { cause }),
      projectFailure: (failure: TribeMembershipLifecycleError, requestId) => ({ status: TRIBE_MEMBERSHIP_LIFECYCLE_HTTP_STATUS[failure.code], body: { code: failure.code, message: TRIBE_MEMBERSHIP_LIFECYCLE_MESSAGES[failure.code], requestId, ...(failure.operationId ? { operationId: failure.operationId } : {}) } }),
    });
    try {
      if (!hasAllowedRequestOrigin(request)) return boundary.failure(new TribeMembershipLifecycleError(TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.permissionDenied));
      const params = boundary.input("params", tribeMembershipLifecycleParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", tribeMembershipLifecycleQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const body = await boundary.readBody(tribeMembershipLifecycleInputSchema);
      if (!body.usable) return body.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!tribe.ok) return boundary.failure(new TribeMembershipLifecycleError(tribe.failure.code === ADMISSION_ERROR_CODE.resourceUnavailable ? TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.resourceUnavailable : TRIBE_MEMBERSHIP_LIFECYCLE_ERROR.unexpectedFailure));
      const command = { ...body.value, tribeId: tribe.value.tribeId, requestId };
      if (recovery) return boundary.success(tribeMembershipLifecycleRecoverySchema, { original: await services.membership.recover(command) });
      const result = await services.membership.change(command);
      return boundary.success(tribeMembershipLifecycleOperationSchema, result, result.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
    } catch (error) { return error instanceof TribeMembershipLifecycleError ? boundary.failure(error) : boundary.unexpected(error); }
  }
  return {
    change: (request: Request, context: { params: Promise<{ slug: string }> }) => execute(request, context, false),
    recover: (request: Request, context: { params: Promise<{ slug: string }> }) => execute(request, context, true),
  };
}
