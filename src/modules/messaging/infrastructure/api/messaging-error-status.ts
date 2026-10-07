/** Own HTTP mapping of semantic failures; upstream statuses are never copied blindly. */
import { HTTP_STATUS } from "@/src/constants/http-status";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

export const MESSAGING_ERROR_HTTP_STATUS = {
  [MESSAGING_ERROR_CODE.invalidInput]: HTTP_STATUS.badRequest,
  [MESSAGING_ERROR_CODE.authenticationRequired]: HTTP_STATUS.unauthorized,
  [MESSAGING_ERROR_CODE.permissionDenied]: HTTP_STATUS.forbidden,
  [MESSAGING_ERROR_CODE.resourceUnavailable]: HTTP_STATUS.notFound,
  [MESSAGING_ERROR_CODE.idempotencyConflict]: HTTP_STATUS.conflict,
  [MESSAGING_ERROR_CODE.usagePolicyConflict]: HTTP_STATUS.conflict,
  [MESSAGING_ERROR_CODE.connectionConflict]: HTTP_STATUS.conflict,
  [MESSAGING_ERROR_CODE.recipientNotAllowed]: HTTP_STATUS.unprocessableEntity,
  [MESSAGING_ERROR_CODE.usageLimitReached]: HTTP_STATUS.tooManyRequests,
  [MESSAGING_ERROR_CODE.credentialValidationLimitReached]: HTTP_STATUS.tooManyRequests,
  [MESSAGING_ERROR_CODE.verificationCodeIncorrect]: HTTP_STATUS.unprocessableEntity,
  [MESSAGING_ERROR_CODE.challengeExpired]: HTTP_STATUS.conflict,
  [MESSAGING_ERROR_CODE.challengeInvalidated]: HTTP_STATUS.conflict,
  [MESSAGING_ERROR_CODE.verificationAttemptsExceeded]: HTTP_STATUS.tooManyRequests,
  [MESSAGING_ERROR_CODE.reauthenticationRequired]: HTTP_STATUS.unauthorized,
  [MESSAGING_ERROR_CODE.connectionIncomplete]: HTTP_STATUS.conflict,
  [MESSAGING_ERROR_CODE.missingCapability]: HTTP_STATUS.conflict,
  [MESSAGING_ERROR_CODE.invalidCredentials]: HTTP_STATUS.conflict,
  [MESSAGING_ERROR_CODE.upstreamRejected]: HTTP_STATUS.unprocessableEntity,
  [MESSAGING_ERROR_CODE.providerRateLimited]: HTTP_STATUS.tooManyRequests,
  [MESSAGING_ERROR_CODE.transportTimeout]: HTTP_STATUS.serviceUnavailable,
  [MESSAGING_ERROR_CODE.dependencyUnavailable]: HTTP_STATUS.serviceUnavailable,
  [MESSAGING_ERROR_CODE.deliveryUnknown]: HTTP_STATUS.serviceUnavailable,
  [MESSAGING_ERROR_CODE.operationUnresolved]: HTTP_STATUS.accepted,
  [MESSAGING_ERROR_CODE.upstreamPayloadUnusable]: HTTP_STATUS.badGateway,
  [MESSAGING_ERROR_CODE.publicContractUnusable]: HTTP_STATUS.serverError,
  [MESSAGING_ERROR_CODE.unexpectedFailure]: HTTP_STATUS.serverError,
} as const;
