/** Handles validated member checkout HTTP requests through application use cases. @module subscription-start-route-handler */
import "server-only";
import { createHash } from "node:crypto";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { ROUTES } from "@/src/constants/routes";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import type { startTribeMemberSubscription, retryTribeMemberSubscriptionPayment } from "@/src/modules/subscriptions/application/use-cases/manage-tribe-member-subscription-use-cases";
import { createOwnJsonRouteBoundary } from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";
import { subscriptionStartParamsSchema, subscriptionStartBodySchema, subscriptionStartCheckoutSchema, subscriptionStartAlreadySubscribedSchema, subscriptionStartErrorSchema } from "./subscription-start-route-schemas";

/** Retains business copy/statuses and rejects unusable input or DTOs safely. */
const SUBSCRIPTION_START_FAILURES = {
  invalid_input: { status: HTTP_STATUS.badRequest, message: "La solicitud de pago no es válida." },
  unauthorized: { status: HTTP_STATUS.unauthorized, message: "Iniciá sesión para continuar." },
  conduct_blocked: { status: HTTP_STATUS.forbidden, message: "No podés reingresar a esta tribu con esta cuenta." },
  invalid_invitation: { status: HTTP_STATUS.forbidden, message: "La invitación no está disponible." },
  missing_current_price: { status: HTTP_STATUS.badRequest, message: "La tribu no tiene un precio actual disponible." },
  payment_blocked: { status: HTTP_STATUS.serviceUnavailable, message: "No pudimos iniciar el pago. Intentá de nuevo." },
} as const;
/** Preserves operation identities; raw invitation/header values stay private. */
const SUBSCRIPTION_IDEMPOTENCY = { header: "x-idempotency-key", hashAlgorithm: "sha256", hashEncoding: "hex", separator: ":" } as const;
/** Names the fixed operation owning safe HTTP failures. */
const SUBSCRIPTION_START_OPERATION = { feature: "subscriptions", operation: "start-tribe-subscription-checkout" } as const;
/** Maps known operation failures to own public responses. */
type SubscriptionStartFailure = { code: keyof typeof SUBSCRIPTION_START_FAILURES };
/** Accepts only application collaborators needed by this inbound adapter. */
export type SubscriptionStartModules = {
  auth: { useCases: { getAuthenticatedMember: () => Promise<{ id: string } | null> } };
  subscriptions: { useCases: {
    startTribeMemberSubscription: ReturnType<typeof startTribeMemberSubscription>;
    retryTribeMemberSubscriptionPayment: ReturnType<typeof retryTribeMemberSubscriptionPayment>;
  } };
};

/**
 * Hashes raw request keys before composing the private operation identity.
 * @param value - Invitation or explicit attempt key, never logged.
 * @returns Stable digest using the existing checkout identity format.
 */
function hashCheckoutKey(value: string): string {
  return createHash(SUBSCRIPTION_IDEMPOTENCY.hashAlgorithm).update(value).digest(SUBSCRIPTION_IDEMPOTENCY.hashEncoding);
}

/**
 * Creates the HTTP adapter with deferred request-scoped dependency composition.
 * @param createModules - Actual composition root receiving the safe correlation identifier.
 * @returns Handler validating input once, invoking one use case and projecting its own DTO.
 */
export function createSubscriptionStartRouteHandler(createModules: (input: { requestId: string }) => Promise<SubscriptionStartModules>) {
  return async (request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> => {
    const boundary = createOwnJsonRouteBoundary<SubscriptionStartFailure, { message: string; requestId: string }>({
      request, ...SUBSCRIPTION_START_OPERATION, errorSchema: subscriptionStartErrorSchema,
      projectFailure: (failure: { code: keyof typeof SUBSCRIPTION_START_FAILURES }, requestId) => ({
        status: SUBSCRIPTION_START_FAILURES[failure.code].status,
        body: { message: SUBSCRIPTION_START_FAILURES[failure.code].message, requestId },
      }),
      invalidInput: () => ({ code: "invalid_input" as const }),
      unusableContract: () => ({ code: "payment_blocked" as const }),
      unexpectedFailure: () => ({ code: "payment_blocked" as const }),
    });
    try {
      const params = boundary.input("params", subscriptionStartParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const body = await boundary.readBody(subscriptionStartBodySchema);
      if (!body.usable) return body.response;
      const modules = await createModules({ requestId: boundary.requestContext.requestId });
      const member = await modules.auth.useCases.getAuthenticatedMember();
      if (!member) return boundary.failure({ code: "unauthorized" });
      const invitationToken = body.value.invitationToken ?? "";
      const idempotencyKey = [member.id, params.value.slug, hashCheckoutKey(invitationToken),
        hashCheckoutKey(request.headers.get(SUBSCRIPTION_IDEMPOTENCY.header) ?? invitationToken)]
        .join(SUBSCRIPTION_IDEMPOTENCY.separator);
      const result = invitationToken
        ? await modules.subscriptions.useCases.startTribeMemberSubscription({ idempotencyKey, invitationToken, tribeSlug: params.value.slug })
        : await modules.subscriptions.useCases.retryTribeMemberSubscriptionPayment({ idempotencyKey, tribeSlug: params.value.slug });
      switch (result.status) {
        case TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending:
          return boundary.success(subscriptionStartCheckoutSchema, { checkoutUrl: result.checkoutUrl });
        case TRIBE_MEMBER_SUBSCRIPTION_STATUS.alreadySubscribed:
          return boundary.success(subscriptionStartAlreadySubscribedSchema, { subscriptionUrl: ROUTES.tribes.subscription(params.value.slug) });
        case TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked:
        case TRIBE_MEMBER_SUBSCRIPTION_STATUS.invalidInvitation:
        case TRIBE_MEMBER_SUBSCRIPTION_STATUS.missingCurrentPrice:
          return boundary.failure({ code: result.status });
        default:
          return boundary.failure({ code: "payment_blocked" });
      }
    } catch (error) {
      return boundary.unexpected(error);
    }
  };
}
