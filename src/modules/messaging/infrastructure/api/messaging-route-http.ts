/** Wires own messaging HTTP responses and classifies private provider failures by status first. */
import "server-only";
import { APIConnectionError, APIConnectionTimeoutError } from "@zavudev/sdk";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";
import { messagingFailure, type MessagingFailure, type MessagingPublicError } from "@/src/modules/messaging/application/results/messaging-errors";
import { messagingPublicErrorSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { createOwnJsonRouteBoundary, type OwnHttpDiagnostic } from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";
import { MESSAGING_ERROR_HTTP_STATUS } from "./messaging-error-status";

const MESSAGING_HTTP_FEATURE = "messaging";
const MESSAGING_PROVIDER_OPERATION = { read: "read", send: "send" } as const;

/**
 * Classifies an SDK/transport exception without interpreting its message or validating its payload.
 *
 * An authorized send can already have an external effect. Timeout, transport
 * loss, 5xx or an uncorrelated 409 then remain unknown for the durable attempt
 * owner to finalize; this function never grants retry or releases a reservation.
 *
 * @param error - Real caught SDK/transport value; retained only as a private cause.
 * @param context - Read/send and the actual durable authorization-marker facts.
 * @returns A closed own failure with minimal private HTTP metadata.
 */
export function normalizeMessagingProviderFailure(error: unknown, context: { operation: "read" | "send"; dispatchAuthorized: boolean }): MessagingFailure {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" && Number.isInteger(error.status) ? error.status : undefined;
  const details = { cause: error, ...(status !== undefined ? { upstreamStatus: status } : {}) };
  const possibleDispatch = context.operation === MESSAGING_PROVIDER_OPERATION.send && context.dispatchAuthorized;
  if (status !== undefined) {
    if (status === HTTP_STATUS.requestTimeout) return messagingFailure(possibleDispatch ? MESSAGING_ERROR_CODE.deliveryUnknown : MESSAGING_ERROR_CODE.transportTimeout, details);
    if (status === HTTP_STATUS.unauthorized) return messagingFailure(MESSAGING_ERROR_CODE.invalidCredentials, details);
    if (status === HTTP_STATUS.forbidden) return messagingFailure(MESSAGING_ERROR_CODE.missingCapability, details);
    if (status === HTTP_STATUS.tooManyRequests) return messagingFailure(MESSAGING_ERROR_CODE.providerRateLimited, details);
    if (status === HTTP_STATUS.conflict && possibleDispatch) return messagingFailure(MESSAGING_ERROR_CODE.deliveryUnknown, details);
    if (status >= HTTP_STATUS.serverError) return messagingFailure(possibleDispatch ? MESSAGING_ERROR_CODE.deliveryUnknown : MESSAGING_ERROR_CODE.dependencyUnavailable, details);
    if (status === HTTP_STATUS.notFound) return messagingFailure(MESSAGING_ERROR_CODE.resourceUnavailable, details);
    if (status >= HTTP_STATUS.badRequest) return messagingFailure(MESSAGING_ERROR_CODE.upstreamRejected, details);
  }
  if (possibleDispatch) return messagingFailure(MESSAGING_ERROR_CODE.deliveryUnknown, details);
  if (error instanceof APIConnectionTimeoutError || (error instanceof DOMException && error.name === "TimeoutError")) return messagingFailure(MESSAGING_ERROR_CODE.transportTimeout, details);
  if (error instanceof APIConnectionError) return messagingFailure(MESSAGING_ERROR_CODE.dependencyUnavailable, details);
  return messagingFailure(MESSAGING_ERROR_CODE.unexpectedFailure, details);
}

/**
 * Builds a response boundary with owner copy and no exposure of SDK causes or status.
 * @param input - Native request, fixed operation and optional own diagnostics sink.
 * @returns Own input/DTO validation and safe HTTP outcome helpers.
 */
export function createMessagingRouteBoundary(input: { request: Request; operation: string; diagnostics?: (diagnostic: OwnHttpDiagnostic) => void }) {
  return createOwnJsonRouteBoundary<MessagingFailure, MessagingPublicError>({
    ...input, feature: MESSAGING_HTTP_FEATURE, errorSchema: messagingPublicErrorSchema,
    invalidInput: () => messagingFailure(MESSAGING_ERROR_CODE.invalidInput),
    unusableContract: () => messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable),
    unexpectedFailure: (cause) => messagingFailure(MESSAGING_ERROR_CODE.unexpectedFailure, { cause }),
    projectFailure: (failure, requestId) => ({ status: MESSAGING_ERROR_HTTP_STATUS[failure.code], body: {
      code: failure.code, message: MESSAGING_ERROR_MESSAGE[failure.code], requestId,
      ...(failure.retryAt !== undefined ? { retryAt: failure.retryAt } : {}),
      ...(failure.operation !== undefined ? { operation: failure.operation } : {}),
    } }),
  });
}
