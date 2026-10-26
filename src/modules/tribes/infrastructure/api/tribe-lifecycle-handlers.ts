/** Serves lifecycle commands and read-only original recovery under a durable UUID route. @module tribe-lifecycle-handlers */
import "server-only";
import { createOwnJsonRouteBoundary } from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";
import { hasAllowedRequestOrigin } from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";
import type { ManageTribeLifecycleUseCases } from "../../application/use-cases/manage-tribe-lifecycle-use-cases";
import { TribeLifecycleError } from "../../domain/errors/tribe-lifecycle-error";
import { TRIBE_LIFECYCLE_ERROR } from "../../constants/tribe-lifecycle";
import { TRIBE_LIFECYCLE_HTTP_FEATURE, TRIBE_LIFECYCLE_HTTP_OPERATION, TRIBE_LIFECYCLE_HTTP_STATUS, TRIBE_LIFECYCLE_MESSAGE, tribeLifecycleEmptyQuerySchema, tribeLifecycleInputSchema, tribeLifecycleOriginalSchema, tribeLifecycleParamsSchema, tribeLifecyclePublicErrorSchema, tribeLifecycleRecoverySchema } from "../../constants/tribe-lifecycle-http";

/** @param open - Native account and owner composition. @returns Confirmed mutation and observation handlers without a live slug lookup. */
export function createTribeLifecycleHandlers(open: () => Promise<{ lifecycle: Pick<ManageTribeLifecycleUseCases, "change" | "recover"> }>) {
  /** @param request - Native request. @param context - Framework UUID scope. @param recovery - Fixed route intent. @returns Safe own result or a closed failure with private diagnostics. */
  async function execute(request: Request, context: { params: Promise<{ tribeId: string }> }, recovery: boolean): Promise<Response> {
    const boundary = createOwnJsonRouteBoundary({ request, feature: TRIBE_LIFECYCLE_HTTP_FEATURE, operation: recovery ? TRIBE_LIFECYCLE_HTTP_OPERATION.recover : TRIBE_LIFECYCLE_HTTP_OPERATION.change, errorSchema: tribeLifecyclePublicErrorSchema,
      invalidInput: () => new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.invalidInput), unusableContract: () => new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.publicContractUnusable), unexpectedFailure: (cause) => new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.unexpectedFailure, { cause }),
      projectFailure: (failure: TribeLifecycleError, requestId) => ({ status: TRIBE_LIFECYCLE_HTTP_STATUS[failure.code], body: { code: failure.code, message: TRIBE_LIFECYCLE_MESSAGE[failure.code], requestId, ...(failure.operationId ? { operationId: failure.operationId } : {}) } }),
    });
    try {
      if (!hasAllowedRequestOrigin(request)) return boundary.failure(new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.permissionDenied));
      const params = boundary.input("params", tribeLifecycleParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", tribeLifecycleEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const input = await boundary.readBody(tribeLifecycleInputSchema);
      if (!input.usable) return input.response;
      const { lifecycle } = await open(), command = { ...input.value, tribeId: params.value.tribeId, requestId: boundary.requestContext.requestId };
      return recovery ? boundary.success(tribeLifecycleRecoverySchema, { original: await lifecycle.recover(command) }) : boundary.success(tribeLifecycleOriginalSchema, await lifecycle.change(command));
    } catch (error) { return error instanceof TribeLifecycleError ? boundary.failure(error) : boundary.unexpected(error); }
  }
  return { change: (request: Request, context: { params: Promise<{ tribeId: string }> }) => execute(request, context, false), recover: (request: Request, context: { params: Promise<{ tribeId: string }> }) => execute(request, context, true) };
}
