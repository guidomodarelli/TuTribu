/** Wires own messaging HTTP responses and classifies private provider failures by status first. */
import "server-only";
import { APIConnectionError, APIConnectionTimeoutError } from "@zavudev/sdk";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "@/src/modules/messaging/constants/messaging-errors";
import { messagingFailure, type MessagingFailure, type MessagingPublicError } from "@/src/modules/messaging/application/results/messaging-errors";
import { messagingPublicErrorSchema } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import { createOwnJsonRouteBoundary, type OwnHttpDiagnostic, projectOwnPublicFailure } from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";
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
  const status = upstreamStatus(error);
  const details = { cause: error, ...(status !== undefined ? { upstreamStatus: status } : {}) };
  const possibleDispatch = context.operation === MESSAGING_PROVIDER_OPERATION.send && context.dispatchAuthorized;
  const statusCode = status === undefined ? undefined : upstreamStatusCode(status, possibleDispatch);
  if (statusCode) return messagingFailure(statusCode, details);
  if (possibleDispatch) return messagingFailure(MESSAGING_ERROR_CODE.deliveryUnknown, details);
  return messagingFailure(transportFailureCode(error), details);
}

/** @param error - Real caught SDK/transport value. @returns Its integer HTTP status, when it carries one. */
function upstreamStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" && Number.isInteger(error.status) ? error.status : undefined;
}

/** @param status - Upstream HTTP status. @param possibleDispatch - Whether an authorized send may already have dispatched. @returns The own code for that status, or undefined for a non-error status. */
function upstreamStatusCode(status: number, possibleDispatch: boolean) {
  if (status === HTTP_STATUS.requestTimeout) return possibleDispatch ? MESSAGING_ERROR_CODE.deliveryUnknown : MESSAGING_ERROR_CODE.transportTimeout;
  if (status === HTTP_STATUS.unauthorized) return MESSAGING_ERROR_CODE.invalidCredentials;
  if (status === HTTP_STATUS.forbidden) return MESSAGING_ERROR_CODE.missingCapability;
  if (status === HTTP_STATUS.tooManyRequests) return MESSAGING_ERROR_CODE.providerRateLimited;
  if (status === HTTP_STATUS.conflict && possibleDispatch) return MESSAGING_ERROR_CODE.deliveryUnknown;
  if (status >= HTTP_STATUS.serverError) return possibleDispatch ? MESSAGING_ERROR_CODE.deliveryUnknown : MESSAGING_ERROR_CODE.dependencyUnavailable;
  if (status === HTTP_STATUS.notFound) return MESSAGING_ERROR_CODE.resourceUnavailable;
  if (status >= HTTP_STATUS.badRequest) return MESSAGING_ERROR_CODE.upstreamRejected;
  return undefined;
}

/** @param error - Real caught SDK/transport value without a usable HTTP status. @returns Timeout, unavailable transport, or unexpected failure. */
function transportFailureCode(error: unknown) {
  if (error instanceof APIConnectionTimeoutError || (error instanceof DOMException && error.name === "TimeoutError")) return MESSAGING_ERROR_CODE.transportTimeout;
  if (error instanceof APIConnectionError) return MESSAGING_ERROR_CODE.dependencyUnavailable;
  return MESSAGING_ERROR_CODE.unexpectedFailure;
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
    projectFailure: (failure, requestId) => projectOwnPublicFailure(failure, requestId, { status: MESSAGING_ERROR_HTTP_STATUS, message: MESSAGING_ERROR_MESSAGE }),
  });
}

/** @param state - State of the original operation. @returns 202 while the original operation is still started, otherwise 200. */
export function messagingOperationHttpStatus(state: string): number {
  return state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok;
}
