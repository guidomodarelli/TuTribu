/**
 * Starts checkout for the current tribe subscription price.
 *
 * @module tribe-subscription-start-route
 */

import { createHash } from "crypto";

import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";

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
  const { slug } = await context.params;
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return Response.json(
      { message: SUBSCRIPTION_START_RESPONSE.unauthorizedMessage },
      { status: HTTP_STATUS.unauthorized }
    );
  }

  const body = await request.json().catch(() => null);
  const invitationToken = readStringField(
    body,
    SUBSCRIPTION_START_FIELD.invitationToken
  );
  const idempotencyKey =
    buildSubscriptionIdempotencyKey({
      idempotencyKey:
        request.headers.get(SUBSCRIPTION_IDEMPOTENCY.header) ?? invitationToken,
      invitationToken,
      memberId: authenticatedMember.id,
      tribeSlug: slug,
    });
  const result =
    await modules.subscriptions.useCases.startTribeMemberSubscription({
      idempotencyKey,
      invitationToken,
      tribeSlug: slug,
    });

  switch (result.status) {
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending:
      return Response.json(
        { checkoutUrl: result.checkoutUrl },
        { status: HTTP_STATUS.ok }
      );
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked:
      return Response.json(
        { message: SUBSCRIPTION_START_RESPONSE.conductBlockedMessage },
        { status: HTTP_STATUS.forbidden }
      );
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.invalidInvitation:
      return Response.json(
        { message: SUBSCRIPTION_START_RESPONSE.invalidInvitationMessage },
        { status: HTTP_STATUS.forbidden }
      );
    case TRIBE_MEMBER_SUBSCRIPTION_STATUS.missingCurrentPrice:
      return Response.json(
        { message: SUBSCRIPTION_START_RESPONSE.missingCurrentPriceMessage },
        { status: HTTP_STATUS.badRequest }
      );
    default:
      return Response.json(
        { message: SUBSCRIPTION_START_RESPONSE.paymentBlockedMessage },
        { status: HTTP_STATUS.serviceUnavailable }
      );
  }
}
