/**
 * Starts checkout for the current tribe subscription price.
 *
 * @module tribe-subscription-start-route
 */

import { createHash } from "crypto";

import { ROUTES } from "@/src/constants/routes";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { createRouteObservation } from "@/src/modules/shared/infrastructure/observability/route-observation";

const SUBSCRIPTION_START_RESPONSE = {
  conductBlockedMessage: "No podés reingresar a esta tribu con esta cuenta.",
  invalidInvitationMessage: "La invitación no está disponible.",
  missingCurrentPriceMessage: "La tribu no tiene un precio actual disponible.",
  paymentBlockedMessage: "No pudimos iniciar el pago. Intentá de nuevo.",
  unauthorizedMessage: "Iniciá sesión para continuar.",
} as const;

const SUBSCRIPTION_START_FIELD = {
  invitationToken: "invitationToken",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  ok: 200,
  serviceUnavailable: 503,
  unauthorized: 401,
} as const;

const SUBSCRIPTION_IDEMPOTENCY = {
  header: "x-idempotency-key",
  hashAlgorithm: "sha256",
  hashEncoding: "hex",
  separator: ":",
} as const;

const SUBSCRIPTION_START_LOG = {
  blockedMessage: "Tribe subscription checkout blocked",
  feature: "subscriptions",
  operation: "start-tribe-subscription-checkout",
  resultMessage: "Tribe subscription checkout resolved",
} as const;

const SUBSCRIPTION_START_LOG_LEVEL = {
  warn: "warn",
} as const;

/**
 * Reads a string field from an unknown JSON body.
 *
 * @param body - Parsed JSON body.
 * @param field - Field name to read.
 * @returns String field value or an empty string.
 */
function readStringField(body: unknown, field: string): string {
  if (!body || typeof body !== "object" || !(field in body)) {
    return "";
  }

  const value = (body as Record<string, unknown>)[field];

  return typeof value === "string" ? value : "";
}

/**
 * Builds a stable subscription checkout idempotency key without storing raw tokens.
 *
 * @param input - Member, tribe, invitation, and request idempotency identifiers.
 * @returns Stable idempotency key scoped to one checkout attempt.
 */
function buildSubscriptionIdempotencyKey(input: {
  idempotencyKey: string;
  invitationToken: string;
  memberId: string;
  tribeSlug: string;
}): string {
  const invitationTokenHash = createHash(SUBSCRIPTION_IDEMPOTENCY.hashAlgorithm)
    .update(input.invitationToken)
    .digest(SUBSCRIPTION_IDEMPOTENCY.hashEncoding);
  const idempotencyKeyHash = createHash(SUBSCRIPTION_IDEMPOTENCY.hashAlgorithm)
    .update(input.idempotencyKey)
    .digest(SUBSCRIPTION_IDEMPOTENCY.hashEncoding);

  return [
    input.memberId,
    input.tribeSlug,
    invitationTokenHash,
    idempotencyKeyHash,
  ].join(SUBSCRIPTION_IDEMPOTENCY.separator);
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const routeObservation = createRouteObservation({
    feature: SUBSCRIPTION_START_LOG.feature,
    operation: SUBSCRIPTION_START_LOG.operation,
    request,
  });
  const [{ slug }, modules] = await Promise.all([
    context.params,
    createRequestModules({ requestId: routeObservation.requestId }),
  ]);
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return routeObservation.createJsonResponse(
      { message: SUBSCRIPTION_START_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized,
      {
        message: SUBSCRIPTION_START_LOG.blockedMessage,
        metadata: {
          slug,
        },
        outcome: "unauthorized",
        level: SUBSCRIPTION_START_LOG_LEVEL.warn,
      }
    );
  }

  const body = await request.json().catch(() => null);
  const invitationToken = readStringField(
    body,
    SUBSCRIPTION_START_FIELD.invitationToken
  );
  const hasInvitationToken = invitationToken.trim().length > 0;
  const idempotencyKey =
    buildSubscriptionIdempotencyKey({
      idempotencyKey:
        request.headers.get(SUBSCRIPTION_IDEMPOTENCY.header) ?? invitationToken,
      invitationToken,
      memberId: authenticatedMember.id,
      tribeSlug: slug,
    });
  const result = hasInvitationToken
    ? await modules.subscriptions.useCases.startTribeMemberSubscription({
        idempotencyKey,
        invitationToken,
        tribeSlug: slug,
      })
    : await modules.subscriptions.useCases.retryTribeMemberSubscriptionPayment({
        idempotencyKey,
        tribeSlug: slug,
      });

  switch (result.status) {
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending:
      return routeObservation.createJsonResponse(
        { checkoutUrl: result.checkoutUrl },
        HTTP_STATUS.ok,
        {
          message: SUBSCRIPTION_START_LOG.resultMessage,
          metadata: {
            hasInvitationToken,
            slug,
            viewerId: authenticatedMember.id,
          },
          outcome: result.status,
        }
      );
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.alreadySubscribed:
      return routeObservation.createJsonResponse(
        { subscriptionUrl: ROUTES.tribes.subscription(slug) },
        HTTP_STATUS.ok,
        {
          message: SUBSCRIPTION_START_LOG.resultMessage,
          metadata: {
            hasInvitationToken,
            slug,
            viewerId: authenticatedMember.id,
          },
          outcome: result.status,
        }
      );
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked:
      return routeObservation.createJsonResponse(
        { message: SUBSCRIPTION_START_RESPONSE.conductBlockedMessage },
        HTTP_STATUS.forbidden,
        {
          message: SUBSCRIPTION_START_LOG.blockedMessage,
          metadata: {
            hasInvitationToken,
            slug,
            viewerId: authenticatedMember.id,
          },
          outcome: result.status,
          level: SUBSCRIPTION_START_LOG_LEVEL.warn,
        }
      );
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.invalidInvitation:
      return routeObservation.createJsonResponse(
        { message: SUBSCRIPTION_START_RESPONSE.invalidInvitationMessage },
        HTTP_STATUS.forbidden,
        {
          message: SUBSCRIPTION_START_LOG.blockedMessage,
          metadata: {
            hasInvitationToken,
            slug,
            viewerId: authenticatedMember.id,
          },
          outcome: result.status,
          level: SUBSCRIPTION_START_LOG_LEVEL.warn,
        }
      );
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.missingCurrentPrice:
      return routeObservation.createJsonResponse(
        { message: SUBSCRIPTION_START_RESPONSE.missingCurrentPriceMessage },
        HTTP_STATUS.badRequest,
        {
          message: SUBSCRIPTION_START_LOG.blockedMessage,
          metadata: {
            hasInvitationToken,
            slug,
            viewerId: authenticatedMember.id,
          },
          outcome: result.status,
          level: SUBSCRIPTION_START_LOG_LEVEL.warn,
        }
      );
    default:
      return routeObservation.createJsonResponse(
        { message: SUBSCRIPTION_START_RESPONSE.paymentBlockedMessage },
        HTTP_STATUS.serviceUnavailable,
        {
          message: SUBSCRIPTION_START_LOG.blockedMessage,
          metadata: {
            hasInvitationToken,
            slug,
            viewerId: authenticatedMember.id,
          },
          outcome: result.status,
          level: SUBSCRIPTION_START_LOG_LEVEL.warn,
        }
      );
  }
}
