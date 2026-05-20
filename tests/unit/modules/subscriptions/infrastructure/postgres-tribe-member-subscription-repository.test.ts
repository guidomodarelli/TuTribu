import { createKyselyRequestDatabase } from "@/src/modules/shared/infrastructure/database/kysely-request-database";
import {
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON,
} from "@/src/modules/subscriptions/constants/subscriptions";
import { PostgresTribeMemberSubscriptionRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";

type QueryHandler = (
  sqlText: string,
  parameters: readonly unknown[]
) => Record<string, unknown>[] | undefined;

const PROVIDER_PLAN_CHECKOUT_URL =
  "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=provider-plan-1";
const OTHER_PROVIDER_PLAN_CHECKOUT_URL =
  "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=other-provider-plan";

function createExecute(...handlers: QueryHandler[]) {
  return jest.fn(async (sqlText: string, parameters: readonly unknown[] = []) => {
    const rows = handlers.reduce<Record<string, unknown>[] | undefined>(
      (handledRows, handler) => handledRows ?? handler(sqlText, parameters),
      undefined
    );

    if (!rows) {
      throw new Error(`Unhandled query: ${sqlText}`);
    }

    return { rows };
  });
}

function createRepository(
  execute: jest.Mock,
  options: {
    buildMercadoPagoPlanCheckoutUrl?: jest.Mock;
    getMercadoPagoPreapprovalDetails?: jest.Mock;
    getMercadoPagoPreapprovalStatus?: jest.Mock;
    refreshMercadoPagoAccessToken?: jest.Mock;
    updateMercadoPagoPreapprovalStatus?: jest.Mock;
  } = {}
) {
  return new PostgresTribeMemberSubscriptionRepository(
    async (callback) =>
      callback({
        execute,
        kysely: createKyselyRequestDatabase({
          query: async (sqlText: string, parameters: readonly unknown[]) => {
            const result = await execute(sqlText, parameters);
            const rows = result.rows ?? [];

            return {
              ...result,
              rowCount: result.rowCount ?? rows.length,
              rows,
            };
          },
        } as never),
      } as never),
    options.buildMercadoPagoPlanCheckoutUrl ??
      jest.fn(() => PROVIDER_PLAN_CHECKOUT_URL),
    options.getMercadoPagoPreapprovalDetails ?? jest.fn(),
    options.getMercadoPagoPreapprovalStatus ?? jest.fn(),
    options.updateMercadoPagoPreapprovalStatus ?? jest.fn(),
    options.refreshMercadoPagoAccessToken ?? jest.fn()
  );
}

function baseRows(input: {
  activeInvitation?: boolean;
  currentPrice?: Record<string, unknown> | null;
  existingMembership?: Record<string, unknown> | null;
  paymentIntegration?: Record<string, unknown> | null;
  subscriptionRows?: Record<string, unknown>[];
  idempotencyRows?: Record<string, unknown>[];
} = {}): QueryHandler {
  return (sqlText, parameters) => {
    if (sqlText.startsWith("select") && sqlText.includes("set_config")) {
      return [{}];
    }

    if (sqlText.includes('from "tribes"')) {
      return parameters[0] === "unknown-tribe" ? [] : [{ id: "tribe-1" }];
    }

    if (sqlText.includes('from "tribe_invitations"')) {
      return input.activeInvitation === false ? [] : [{ id: "invitation-1" }];
    }

    if (sqlText.includes('from "tribe_subscription_prices"')) {
      return input.currentPrice === null
        ? []
        : [
            input.currentPrice ?? {
              amount_cents: 1500,
              currency: "ARS",
              id: "price-1",
              mercado_pago_preapproval_plan_id: "provider-plan-1",
              name: "Plan mensual",
            },
          ];
    }

    if (sqlText.includes('from "tribe_payment_integrations"')) {
      return input.paymentIntegration === null
        ? []
        : [
            input.paymentIntegration ?? {
              access_token: "access-token",
              refresh_token: null,
              token_expires_at: null,
            },
          ];
    }

    if (
      sqlText.includes('from "tribe_members"') &&
      !sqlText.startsWith("update") &&
      !sqlText.startsWith("insert")
    ) {
      return input.existingMembership === null
        ? []
        : [
            input.existingMembership ?? {
              status: "blocked",
              status_reason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked,
            },
          ];
    }

    if (
      sqlText.includes('from "subscription_idempotency_operations"') &&
      !sqlText.startsWith("insert")
    ) {
      return input.idempotencyRows ?? [];
    }

    if (
      sqlText.includes('from "tribe_member_subscriptions"') &&
      !sqlText.startsWith("update") &&
      !sqlText.startsWith("insert")
    ) {
      return input.subscriptionRows ?? [];
    }

    if (sqlText.startsWith("insert") || sqlText.startsWith("update")) {
      return [{ id: "mutation-1", operation_inserted: "operation-1" }];
    }

    if (sqlText.includes("current_app_user_email")) {
      return [{ current_user_email: "member@example.com" }];
    }

    return undefined;
  };
}

describe("PostgresTribeMemberSubscriptionRepository", () => {
  const previousBaseUrl = process.env.BETTER_AUTH_URL;

  beforeEach(() => {
    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";
  });

  afterAll(() => {
    if (previousBaseUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBaseUrl;
    }
  });

  it("validates Mercado Pago return ids for the current pending subscription", async () => {
    const execute = createExecute(
      baseRows({
        subscriptionRows: [{ id: "subscription-1" }],
      })
    );
    const repository = createRepository(execute);

    await expect(
      repository.hasPendingSubscriptionReturn({
        providerSubscriptionId: "preapproval-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toBe(true);
  });

  it("resolves Mercado Pago return paths from stored provider subscription ids", async () => {
    const execute = createExecute(
      (sqlText) =>
        sqlText.includes('from "tribe_member_subscriptions"') &&
        sqlText.includes('inner join "tribes"')
          ? [{ tribe_slug: "matematica-pro" }]
          : undefined,
      baseRows()
    );
    const repository = createRepository(execute);

    await expect(
      repository.resolveReturnPathByProviderSubscription({
        providerSubscriptionId: "preapproval-1",
      })
    ).resolves.toBe("/tribu/matematica-pro?preapproval_id=preapproval-1");
  });

  it("reuses an existing pending provider-plan checkout", async () => {
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const execute = createExecute(
      baseRows({
        idempotencyRows: [{ response_body: { checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL } }],
        subscriptionRows: [
          {
            id: "subscription-1",
            mercado_pago_preapproval_id: null,
          },
        ],
      })
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    });
    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
  });

  it("sets invitation RLS context before resolving the checkout tribe", async () => {
    let invitationContextWasSet = false;
    const execute = createExecute(
      (sqlText, parameters) => {
        if (
          sqlText.startsWith("select") &&
          sqlText.includes("set_config") &&
          parameters.includes("app.current_invitation_hash")
        ) {
          invitationContextWasSet = true;

          return [{}];
        }

        if (sqlText.includes('from "tribes"') && !invitationContextWasSet) {
          return [];
        }

        return undefined;
      },
      baseRows({
        idempotencyRows: [{ response_body: { checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL } }],
        subscriptionRows: [
          {
            id: "subscription-1",
            mercado_pago_preapproval_id: null,
          },
        ],
      })
    );
    const repository = createRepository(execute);

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    });
  });

  it("replaces stale checkout URLs that point to another provider plan", async () => {
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const execute = createExecute(
      baseRows({
        idempotencyRows: [
          { response_body: { checkoutUrl: OTHER_PROVIDER_PLAN_CHECKOUT_URL } },
        ],
        subscriptionRows: [
          {
            id: "subscription-1",
            mercado_pago_preapproval_id: null,
          },
        ],
      })
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    });
    expect(buildMercadoPagoPlanCheckoutUrl).toHaveBeenCalledWith(
      "provider-plan-1"
    );
  });

  it("does not reuse a checkout operation when the active subscription slot blocks a new reservation", async () => {
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const execute = createExecute(
      (sqlText) => {
        if (
          sqlText.startsWith('insert into "tribe_member_subscriptions"') ||
          (sqlText.startsWith("update") &&
            sqlText.includes('"tribe_member_subscriptions"'))
        ) {
          return [];
        }

        if (
          sqlText.includes('from "tribe_member_subscriptions"') &&
          sqlText.includes('"status" in')
        ) {
          return [{ id: "active-subscription-1" }];
        }

        if (
          sqlText.includes('from "tribe_member_subscriptions"') &&
          sqlText.includes('"status" =')
        ) {
          return [];
        }

        return undefined;
      },
      baseRows({
        idempotencyRows: [{ response_body: { checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL } }],
      })
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "new-attempt",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked,
    });
    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
  });

  it("does not recover returns from historical provider-plan checkouts", async () => {
    const getMercadoPagoPreapprovalDetails = jest.fn(async () => ({
      externalReference: "price:price-1",
      preapprovalPlanId: "provider-plan-1",
    }));
    const execute = createExecute(
      (sqlText) =>
        sqlText.includes('from "subscription_idempotency_operations"') &&
        !sqlText.includes('"created_at" >=')
          ? [{ response_body: { checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL } }]
          : undefined,
      baseRows({
        subscriptionRows: [],
      })
    );
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalDetails,
    });

    await expect(
      repository.resolveSubscriptionReturn({
        providerSubscriptionId: "preapproval-2",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound,
    });
    expect(getMercadoPagoPreapprovalDetails).not.toHaveBeenCalled();
  });

  it("updates provider-plan checkout idempotency only within the current scope", async () => {
    const buildMercadoPagoPlanCheckoutUrl = jest.fn(
      () => PROVIDER_PLAN_CHECKOUT_URL
    );
    const execute = createExecute(
      (sqlText) => {
        if (!sqlText.startsWith('insert into "subscription_idempotency_operations"')) {
          return undefined;
        }

        if (
          !sqlText.includes('"operation_type" = "excluded"."operation_type"') ||
          !sqlText.includes('"tribe_id" = "excluded"."tribe_id"') ||
          !sqlText.includes('"user_id" = "excluded"."user_id"')
        ) {
          throw new Error(`Unscoped idempotency update: ${sqlText}`);
        }

        return [{ id: "operation-1" }];
      },
      baseRows({
        idempotencyRows: [
          { response_body: { checkoutUrl: OTHER_PROVIDER_PLAN_CHECKOUT_URL } },
        ],
        subscriptionRows: [
          {
            id: "subscription-1",
            mercado_pago_preapproval_id: null,
          },
        ],
      })
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.startCurrentPriceSubscription({
        idempotencyKey: "shared-client-key",
        invitationToken: "invitation-token-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      checkoutUrl: PROVIDER_PLAN_CHECKOUT_URL,
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    });
  });

  it("rejects direct retry for conduct-blocked members", async () => {
    const buildMercadoPagoPlanCheckoutUrl = jest.fn();
    const execute = createExecute(
      baseRows({
        existingMembership: {
          status: "blocked",
          status_reason: TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.conductBlocked,
        },
        subscriptionRows: [],
      })
    );
    const repository = createRepository(execute, {
      buildMercadoPagoPlanCheckoutUrl,
    });

    await expect(
      repository.retryCurrentPriceSubscriptionPayment({
        idempotencyKey: "retry-payment",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked,
    });
    expect(buildMercadoPagoPlanCheckoutUrl).not.toHaveBeenCalled();
  });

  it("attaches returned Mercado Pago preapproval ids to pending plan checkouts", async () => {
    const getMercadoPagoPreapprovalStatus = jest.fn(async () => "authorized");
    const execute = createExecute(
      (sqlText) =>
        sqlText.startsWith("update") &&
        sqlText.includes('"mercado_pago_preapproval_id"')
          ? [{ id: "subscription-1" }]
          : undefined,
      baseRows({
        subscriptionRows: [
          {
            id: "subscription-1",
            price_id: "price-1",
          },
        ],
      })
    );
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

    await expect(
      repository.resolveSubscriptionReturn({
        providerSubscriptionId: "preapproval-2",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
    });
    expect(getMercadoPagoPreapprovalStatus).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalId: "preapproval-2",
    });
  });

  it("processes provider webhooks and refreshes membership access", async () => {
    const getMercadoPagoPreapprovalStatus = jest.fn(async () => "authorized");
    const execute = createExecute(
      (sqlText) =>
        sqlText.includes('inner join "tribe_payment_integrations"')
          ? [{
              access_token: "access-token",
              price_id: "price-1",
              refresh_token: null,
              token_expires_at: null,
              tribe_id: "tribe-1",
            }]
          : undefined,
      baseRows({
        subscriptionRows: [
          {
            id: "subscription-1",
            tribe_id: "tribe-1",
            user_id: "user-1",
          },
        ],
      })
    );
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

    await expect(
      repository.handleWebhook({
        eventId: "event-1",
        resourceId: "preapproval-1",
        topic: "subscription_preapproval.updated",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed,
    });
    expect(getMercadoPagoPreapprovalStatus).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalId: "preapproval-1",
    });
    expect(
      execute.mock.calls.some(([sqlText]) =>
        String(sqlText).startsWith('update "tribe_members"')
      )
    ).toBe(true);
  });

  it("limits provider-driven membership access refreshes to tribemates", async () => {
    const getMercadoPagoPreapprovalStatus = jest.fn(async () => "cancelled");
    const execute = createExecute(
      (sqlText) =>
        sqlText.includes('inner join "tribe_payment_integrations"')
          ? [{
              access_token: "access-token",
              price_id: "price-1",
              refresh_token: null,
              token_expires_at: null,
              tribe_id: "tribe-1",
            }]
          : undefined,
      baseRows({
        subscriptionRows: [
          {
            id: "subscription-1",
            tribe_id: "tribe-1",
            user_id: "user-1",
          },
        ],
      })
    );
    const repository = createRepository(execute, {
      getMercadoPagoPreapprovalStatus,
    });

    await expect(
      repository.handleWebhook({
        eventId: "event-1",
        resourceId: "preapproval-1",
        topic: "subscription_preapproval.updated",
      })
    ).resolves.toEqual({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.processed,
    });

    const membershipAccessUpdate = execute.mock.calls.find(([sqlText]) =>
      String(sqlText).startsWith('update "tribe_members"')
    )?.[0];

    expect(membershipAccessUpdate).toEqual(expect.any(String));
    expect(String(membershipAccessUpdate)).toContain('"role" =');
    expect(
      execute.mock.calls.some(([, parameters]) =>
        parameters.includes("tribemate")
      )
    ).toBe(true);
  });
});
