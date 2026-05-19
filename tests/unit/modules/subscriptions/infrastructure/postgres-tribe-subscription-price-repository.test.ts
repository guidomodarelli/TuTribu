import {
  TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import { createKyselyRequestDatabase } from "@/src/modules/shared/infrastructure/database/kysely-request-database";
import { PostgresTribeSubscriptionPriceRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-subscription-price-repository";

type QueryHandler = (
  sqlText: string,
  parameters: readonly unknown[]
) => Record<string, unknown>[] | undefined;

function getSqlText(statement: unknown): string {
  if (typeof statement === "string") {
    return statement;
  }

  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (chunk && typeof chunk === "object" && "queryChunks" in chunk) {
        return getSqlText(chunk);
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      return "";
    })
    .join("");
}

function createExecute(...handlers: QueryHandler[]) {
  return jest.fn(async (statement: unknown, parameters: readonly unknown[] = []) => {
    const sqlText = getSqlText(statement);

    if (
      sqlText.startsWith("SAVEPOINT") ||
      sqlText.startsWith("RELEASE SAVEPOINT") ||
      sqlText.startsWith("ROLLBACK TO SAVEPOINT")
    ) {
      return { rows: [] };
    }

    const handlerRows = handlers.reduce<Record<string, unknown>[] | undefined>(
      (rows, handler) => rows ?? handler(sqlText, parameters),
      undefined
    );

    if (!handlerRows) {
      throw new Error(`Unhandled query: ${sqlText}`);
    }

    return { rows: handlerRows };
  });
}

function createRepository(
  execute: jest.Mock,
  dependencies: {
    createMercadoPagoPlan?: jest.Mock;
    getMercadoPagoPlan?: jest.Mock;
    getMercadoPagoPlanStatus?: jest.Mock;
    getMercadoPagoSubscriptionStatus?: jest.Mock;
    refreshMercadoPagoAccessToken?: jest.Mock;
    updateMercadoPagoPlan?: jest.Mock;
  } = {}
) {
  return new PostgresTribeSubscriptionPriceRepository(
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
    dependencies.createMercadoPagoPlan ?? jest.fn(async () => "plan-1"),
    dependencies.updateMercadoPagoPlan ??
      jest.fn(async () => ({
        amountCents: 500000,
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
        id: "plan-1",
        reason: "Plan mensual",
        status: "active",
      })),
    dependencies.getMercadoPagoPlan ??
      jest.fn(async () => ({
        amountCents: 500000,
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
        id: "plan-1",
        reason: "Plan mensual",
        status: "active",
      })),
    dependencies.refreshMercadoPagoAccessToken ??
      jest.fn(async () => ({
        accessToken: "fresh-access-token",
        expiresIn: 3600,
        providerAccountId: "seller-1",
        refreshToken: "new-refresh-token",
      })),
    dependencies.getMercadoPagoPlanStatus ?? jest.fn(async () => "active"),
    dependencies.getMercadoPagoSubscriptionStatus ??
      jest.fn(async () => "authorized")
  );
}

function createPriceRow(overrides: Record<string, unknown> = {}) {
  return {
    active_subscribers_count: 0,
    amount_cents: 500000,
    created_at: "2026-05-06T13:00:00.000Z",
    currency: "ARS",
    frequency: "monthly",
    id: "price-1",
    is_current: true,
    mercado_pago_preapproval_plan_id: "plan-1",
    name: "Plan mensual",
    status: TRIBE_SUBSCRIPTION_PRICE_STATUS.active,
    status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
    trial_frequency: 7,
    trial_frequency_type: "days",
    ...overrides,
  };
}

function baseRepositoryRows(input: {
  activeSubscribersCount?: number;
  canManagePrices?: boolean;
  canViewPrices?: boolean;
  paymentIntegration?: Record<string, unknown> | null;
  priceRows?: Record<string, unknown>[];
  subscriberRows?: Record<string, unknown>[];
} = {}): QueryHandler {
  return (sqlText, parameters) => {
    if (sqlText.includes('from "tribes"')) {
      return parameters[0] === "unknown-tribe" ? [] : [{ id: "tribe-1" }];
    }

    if (
      sqlText.startsWith("select") &&
      sqlText.includes("can_view_tribe_subscription_prices")
    ) {
      return [{
        can_manage_prices: input.canManagePrices ?? true,
        canManagePrices: input.canManagePrices ?? true,
        can_view_prices: input.canViewPrices ?? true,
        canViewPrices: input.canViewPrices ?? true,
      }];
    }

    if (
      sqlText.startsWith("select") &&
      sqlText.includes("can_manage_tribe_subscription_prices")
    ) {
      return [{
        can_manage_prices: input.canManagePrices ?? true,
        canManagePrices: input.canManagePrices ?? true,
      }];
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

    if (sqlText.includes("set_config")) {
      return [{ token_refresh_context: "tribe-1" }];
    }

    if (sqlText.includes("update public.tribe_payment_integrations")) {
      return [];
    }

    if (
      sqlText.includes('update "tribe_member_subscriptions"') &&
      sqlText.includes('returning "tribe_id", "user_id"')
    ) {
      return [{
        tribe_id: "tribe-1",
        user_id: `user-${String(parameters[2] ?? "").split("-").at(-1)}`,
      }];
    }

    if (sqlText.includes('update "tribe_members"')) {
      return [];
    }

    if (
      sqlText.includes("count(") &&
      sqlText.includes('from "tribe_member_subscriptions"') &&
      sqlText.includes('where "price_id"')
    ) {
      return [{
        active_subscribers_count: input.activeSubscribersCount ?? 0,
      }];
    }

    if (
      sqlText.includes('from "tribe_subscription_prices"') &&
      sqlText.includes("existing_price_count")
    ) {
      return [{ existing_price_count: 0 }];
    }

    if (
      sqlText.includes('from "tribe_subscription_prices"') &&
      !sqlText.includes("update") &&
      !sqlText.includes("insert")
    ) {
      return input.priceRows ?? [createPriceRow()];
    }

    if (sqlText.includes('from "tribe_member_subscriptions"')) {
      return input.subscriberRows ?? [];
    }

    if (sqlText.includes('insert into "tribe_subscription_prices"')) {
      return [{ id: "price-1" }];
    }

    return undefined;
  };
}

describe("PostgresTribeSubscriptionPriceRepository", () => {
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

  it("lists prices with Mercado Pago health using Kysely-built queries", async () => {
    const execute = createExecute(
      baseRepositoryRows({
        paymentIntegration: {
          access_token: "stored-access-token",
          refresh_token: "stored-refresh-token",
          token_expires_at: null,
        },
      })
    );
    const repository = createRepository(execute);

    await expect(
      repository.listByTribeSlug({ tribeSlug: "matematica-pro" })
    ).resolves.toMatchObject({
      hasMercadoPagoIntegration: true,
      mercadoPagoConnectionStatus: "connected",
      prices: [{ id: "price-1" }],
      viewerPermissions: {
        canManagePrices: true,
        canViewPrices: true,
      },
    });

    expect(
      execute.mock.calls.some(([sqlText]) =>
        String(sqlText).includes('from "tribe_member_subscriptions"')
      )
    ).toBe(true);
  });

  it("refreshes expired Mercado Pago tokens before creating provider plans", async () => {
    const createMercadoPagoPlan = jest.fn(async () => "plan-1");
    const refreshMercadoPagoAccessToken = jest.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "seller-1",
      refreshToken: "new-refresh-token",
    }));
    const execute = createExecute(
      (sqlText) =>
        sqlText.includes('update "tribe_subscription_prices"')
          ? [{
              ...createPriceRow({
                status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
              }),
            }]
          : undefined,
      baseRepositoryRows({
        paymentIntegration: {
          access_token: "expired-access-token",
          refresh_token: "refresh-token",
          token_expires_at: "2026-05-06T12:00:00.000Z",
        },
      })
    );
    const repository = createRepository(execute, {
      createMercadoPagoPlan,
      refreshMercadoPagoAccessToken,
    });

    await expect(
      repository.create({
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
    });

    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith("refresh-token");
    expect(createMercadoPagoPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "fresh-access-token",
        backUrl: "https://tutribu.example.com/tribu/matematica-pro",
      })
    );
  });

  it("returns the price limit status before calling Mercado Pago", async () => {
    const createMercadoPagoPlan = jest.fn(async () => "plan-1");
    const execute = createExecute(
      (sqlText) =>
        sqlText.includes("existing_price_count") ||
        (
          sqlText.includes("count(") &&
          sqlText.includes('from "tribe_subscription_prices"')
        )
          ? [{ existing_price_count: 30 }]
          : undefined,
      baseRepositoryRows()
    );
    const repository = createRepository(execute, { createMercadoPagoPlan });

    await expect(
      repository.create({
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached,
    });
    expect(createMercadoPagoPlan).not.toHaveBeenCalled();
  });

  it("returns forbidden when price management permission is lost before reserving the provider plan price", async () => {
    const createMercadoPagoPlan = jest.fn(async () => "plan-1");
    const execute = createExecute(
      (sqlText) => {
        if (!sqlText.includes('insert into "tribe_subscription_prices"')) {
          return undefined;
        }

        if (sqlText.includes("public.can_manage_tribe_subscription_prices")) {
          return [];
        }

        throw new Error("new row violates row-level security policy");
      },
      baseRepositoryRows()
    );
    const repository = createRepository(execute, { createMercadoPagoPlan });

    await expect(
      repository.create({
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
    });
    expect(createMercadoPagoPlan).not.toHaveBeenCalled();
  });

  it("marks a price as current after clearing other current prices", async () => {
    let updateCount = 0;
    const execute = createExecute(
      (sqlText) => {
        if (!sqlText.includes('update "tribe_subscription_prices"')) {
          return undefined;
        }

        updateCount += 1;

        if (updateCount === 1) {
          return [];
        }

        return [
          createPriceRow({
            is_current: true,
            status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
          }),
        ];
      },
      baseRepositoryRows({
        priceRows: [createPriceRow({ is_current: false })],
      })
    );
    const repository = createRepository(execute);

    await expect(
      repository.makeCurrent({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: { id: "price-1", isCurrent: true },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
    });
  });

  it("reconciles provider subscribers and refreshes member access transactionally", async () => {
    const getMercadoPagoSubscriptionStatus = jest
      .fn()
      .mockResolvedValueOnce("authorized")
      .mockResolvedValueOnce("paused")
      .mockResolvedValueOnce("cancelled");
    const execute = createExecute(
      (sqlText) => {
        if (
          sqlText.includes("jsonb_to_recordset") &&
          sqlText.includes("updated_members") &&
          sqlText.includes("target_price")
        ) {
          return [
            createPriceRow({
              active_subscribers_count: 2,
              mercado_pago_preapproval_plan_id: "plan-1",
            }),
          ];
        }

        return undefined;
      },
      baseRepositoryRows({
        activeSubscribersCount: 2,
        priceRows: [
            createPriceRow({
              active_subscribers_count: 2,
              mercado_pago_preapproval_plan_id: "plan-1",
            }),
        ],
        subscriberRows: [
          { mercado_pago_preapproval_id: "subscription-1" },
          { mercado_pago_preapproval_id: "subscription-2" },
          { mercado_pago_preapproval_id: "subscription-3" },
        ],
      })
    );
    const repository = createRepository(execute, {
      getMercadoPagoSubscriptionStatus,
    });

    await expect(
      repository.reconcileProviderSubscribers({
        priceId: "price-1",
        source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: { activeSubscribersCount: 2 },
      providerActiveSubscribersCount: 2,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 3,
    });
    expect(getMercadoPagoSubscriptionStatus).toHaveBeenCalledTimes(3);
    expect(
      execute.mock.calls.some(([sqlText]) =>
        String(sqlText).includes('update "tribe_member_subscriptions"')
      )
    ).toBe(true);
  });

  it("classifies aggregate subscriber diagnostics from database aggregates", async () => {
    const execute = createExecute(
      (sqlText) =>
        sqlText.includes("count(") &&
        sqlText.includes("filter") &&
        sqlText.includes("max(")
          ? [{
              last_reconciled_at: "2026-05-12T01:05:00.000Z",
              local_active_subscribers_count: 2,
              mercado_pago_authorized_subscribers_count: 1,
              mercado_pago_canceled_or_missing_subscribers_count: 1,
              mercado_pago_paused_subscribers_count: 1,
              mercado_pago_pending_subscribers_count: 1,
              target_tribe_id: "tribe-1",
            }]
          : undefined,
      baseRepositoryRows()
    );
    const repository = createRepository(execute);

    await expect(
      repository.getSubscriberDiagnostics({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      lastReconciledAt: "2026-05-12T01:05:00.000Z",
      localActiveSubscribersCount: 2,
      mercadoPagoAuthorizedSubscribersCount: 1,
      mercadoPagoCanceledOrMissingSubscribersCount: 1,
      mercadoPagoPausedSubscribersCount: 1,
      mercadoPagoPendingSubscribersCount: 1,
    });
    expect(
      execute.mock.calls.some(([sqlText]) =>
        String(sqlText).includes("mercado_pago_preapproval_id,")
      )
    ).toBe(false);
  });

  it("reconciles tribe diagnostics with transactional subscriber updates", async () => {
    const getMercadoPagoSubscriptionStatus = jest
      .fn()
      .mockResolvedValueOnce("authorized")
      .mockResolvedValueOnce("cancelled");
    const execute = createExecute(
      (sqlText) => {
        if (
          sqlText.includes("jsonb_to_recordset") &&
          sqlText.includes("updated_subscriptions") &&
          !sqlText.includes("target_price")
        ) {
          return [];
        }

        if (
          sqlText.includes("count(") &&
          sqlText.includes("filter") &&
          sqlText.includes("max(")
        ) {
          return [{
            last_reconciled_at: "2026-05-12T01:05:00.000Z",
            local_active_subscribers_count: 1,
            mercado_pago_authorized_subscribers_count: 1,
            mercado_pago_canceled_or_missing_subscribers_count: 1,
            mercado_pago_paused_subscribers_count: 0,
            mercado_pago_pending_subscribers_count: 0,
            target_tribe_id: "tribe-1",
          }];
        }

        return undefined;
      },
      baseRepositoryRows({
        activeSubscribersCount: 1,
        paymentIntegration: {
          access_token: "stored-access-token",
          refresh_token: null,
          token_expires_at: null,
        },
        subscriberRows: [
          { mercado_pago_preapproval_id: "subscription-1" },
          { mercado_pago_preapproval_id: "subscription-2" },
        ],
      })
    );
    const repository = createRepository(execute, {
      getMercadoPagoSubscriptionStatus,
    });

    await expect(
      repository.reconcileSubscriberDiagnostics({ tribeSlug: "matematica-pro" })
    ).resolves.toMatchObject({
      diagnostics: {
        localActiveSubscribersCount: 1,
        mercadoPagoCanceledOrMissingSubscribersCount: 1,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 2,
    });
    expect(getMercadoPagoSubscriptionStatus).toHaveBeenCalledTimes(2);
    expect(
      execute.mock.calls.some(([sqlText]) =>
        String(sqlText).includes('update "tribe_member_subscriptions"')
      )
    ).toBe(true);
  });

  it("stops deletion when a local active subscription exists", async () => {
    const updateMercadoPagoPlan = jest.fn();
    const execute = createExecute(
      baseRepositoryRows({
        priceRows: [
          createPriceRow({
            active_subscribers_count: 1,
            mercado_pago_preapproval_plan_id: "plan-1",
            tribe_id: "tribe-1",
            was_current: true,
          }),
        ],
        subscriberRows: [{ id: "subscription-1" }],
      })
    );
    const repository = createRepository(execute, { updateMercadoPagoPlan });

    await expect(
      repository.delete({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers,
    });
    expect(updateMercadoPagoPlan).not.toHaveBeenCalled();
  });
});
