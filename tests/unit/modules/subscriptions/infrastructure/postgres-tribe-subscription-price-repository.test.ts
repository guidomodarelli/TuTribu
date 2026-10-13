import { createPaidAdmissionResolutionWriter } from "@/src/modules/academy-admissions/setup";
import { vi, describe, it, expect, beforeEach, afterAll, type Mock } from "vitest";
import {
  TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import { PostgresTribeSubscriptionPriceRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-subscription-price-repository";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "queryChunks" in chunk
      ) {
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

function createRepository(
  execute: Mock,
  createMercadoPagoPlan: NonNullable<ConstructorParameters<typeof PostgresTribeSubscriptionPriceRepository>[1]> = vi.fn(async () => "plan-1"),
  refreshMercadoPagoAccessToken: NonNullable<ConstructorParameters<typeof PostgresTribeSubscriptionPriceRepository>[4]> = vi.fn(async () => ({
    accessToken: "fresh-access-token",
    expiresIn: 3600,
    providerAccountId: "seller-1",
    refreshToken: "new-refresh-token",
  })),
  getMercadoPagoPlanStatus: NonNullable<ConstructorParameters<typeof PostgresTribeSubscriptionPriceRepository>[5]> = vi.fn(async () => "active"),
  getMercadoPagoSubscriptionStatus: NonNullable<ConstructorParameters<typeof PostgresTribeSubscriptionPriceRepository>[6]> = vi.fn(async () => "authorized"),
  updateMercadoPagoPlan: NonNullable<ConstructorParameters<typeof PostgresTribeSubscriptionPriceRepository>[2]> = vi.fn(async () => ({
    amountCents: 500000,
    currency: "ARS",
    externalReference: "tutribu:price:price-1",
    id: "plan-1",
    reason: "Plan mensual", trial: null,
    status: "active" as const,
  })),
  getMercadoPagoPlan: NonNullable<ConstructorParameters<typeof PostgresTribeSubscriptionPriceRepository>[3]> = vi.fn(async () => ({
    amountCents: 500000,
    currency: "ARS",
    externalReference: "tutribu:price:price-1",
    id: "plan-1",
    reason: "Plan mensual", trial: null,
    status: "active" as const,
  }))
) {
  // These legacy own-port fixtures have no protected tribe. Actual source writes are exercised by the SQL suite.
  const executeLegacyDatabase = (statement: unknown, ...parameters: unknown[]) => {
    const query = getSqlText(statement).trim();
    if (query.startsWith("select ") && query.includes("tribe.admissions_control_activated_at")) return Promise.resolve({ rows: [] });
    return execute(statement, ...parameters);
  };
  return new PostgresTribeSubscriptionPriceRepository(
    async (callback) => callback({ execute: executeLegacyDatabase } as never),
    createMercadoPagoPlan,
    updateMercadoPagoPlan,
    getMercadoPagoPlan,
    refreshMercadoPagoAccessToken,
    getMercadoPagoPlanStatus,
    getMercadoPagoSubscriptionStatus,
    createPaidAdmissionResolutionWriter
  );
}

function createSubscriptionPriceRow(overrides: Record<string, unknown> = {}) {
  return {
    active_subscribers_count: 0,
    amount_cents: 500000,
    access_token: "access-token",
    created_at: "2026-05-06T13:00:00.000Z",
    currency: "ARS",
    frequency: "monthly",
    id: "price-1",
    is_current: true,
    name: "Plan mensual",
    payment_integration_id: "integration-1",
    refresh_token: null,
    status: "active" as const,
    status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
    token_expires_at: null,
    trial_frequency: 7,
    trial_frequency_type: "days",
    ...overrides,
  };
}

describe("PostgresTribeSubscriptionPriceRepository", () => {
  const previousBaseUrl = process.env.BETTER_AUTH_URL;
  const previousMercadoPagoBackUrl = process.env.MERCADO_PAGO_BACK_URL;

  beforeEach(() => {
    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";
    delete process.env.MERCADO_PAGO_BACK_URL;
  });

  afterAll(() => {
    if (previousBaseUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBaseUrl;
    }

    if (previousMercadoPagoBackUrl === undefined) {
      delete process.env.MERCADO_PAGO_BACK_URL;
    } else {
      process.env.MERCADO_PAGO_BACK_URL = previousMercadoPagoBackUrl;
    }
  });

  it("should list prices with connected Mercado Pago health when token refresh succeeds", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          ...createSubscriptionPriceRow(),
          access_token: "stored-access-token",
          can_manage_prices: true,
          can_view_prices: true,
          has_mercado_pago_integration: true,
          mercado_pago_connection_payment_integration_id: "integration-1",
          payment_integration_id: "integration-1",
          refresh_token: "stored-refresh-token",
          token_expires_at: "2026-05-06T13:05:00.000Z",
          tribe_id: "tribe-1",
        },
      ],
    }); });
    const refreshMercadoPagoAccessToken = vi.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "seller-1",
      refreshToken: "new-refresh-token",
    }));
    const repository = createRepository(
      execute,
      vi.fn(async () => "plan-1"),
      refreshMercadoPagoAccessToken
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({ freeJoinIsCurrent: false, openFreeJoinEnabled: false,
      hasMercadoPagoIntegration: true,
      mercadoPagoConnectionStatus: "connected",
      prices: [
        {
          id: "price-1",
        },
      ],
      viewerPermissions: {
        canManagePrices: true,
        canViewPrices: true,
      },
    });

    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith(
      "stored-refresh-token"
    );
  });

  it("should prioritize connected Mercado Pago accounts after refreshing health", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow(),
            access_token: "revoked-access-token",
            can_manage_prices: true,
            can_view_prices: true,
            has_mercado_pago_integration: true,
            mercado_pago_connection_payment_integration_id:
              "revoked-integration",
            refresh_token: "revoked-refresh-token",
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "revoked-access-token",
            account_label: "Cuenta anterior",
            id: "revoked-integration",
            provider_account_email: "old@example.com",
            provider_account_id: "collector-old",
            refresh_token: "revoked-refresh-token",
            status: "connected" as const,
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          },
          {
            access_token: "freshable-access-token",
            account_label: "Cuenta activa",
            id: "active-integration",
            provider_account_email: "active@example.com",
            provider_account_id: "collector-active",
            refresh_token: "active-refresh-token",
            status: "connected" as const,
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const refreshMercadoPagoAccessToken = vi.fn(async (refreshToken) => {
      if (refreshToken === "revoked-refresh-token") {
        throw new Error("Mercado Pago rejected refresh token");
      }

      return {
        accessToken: "fresh-access-token",
        expiresIn: 3600,
        providerAccountId: "collector-active",
        refreshToken: "active-refresh-token",
      };
    });
    const repository = createRepository(
      execute,
      vi.fn(async () => "plan-1"),
      refreshMercadoPagoAccessToken
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      availableMercadoPagoAccounts: [
        {
          id: "active-integration",
          status: "connected" as const,
        },
        {
          id: "revoked-integration",
          status: "requires_reconnection" as const,
        },
      ],
      hasMercadoPagoIntegration: true,
      mercadoPagoConnectionStatus: "connected",
    });
    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith(
      "revoked-refresh-token"
    );
    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith(
      "active-refresh-token"
    );
  });

  it("should keep paused prices visible while preserving subscriber diagnostics", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          ...createSubscriptionPriceRow({
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
          }),
          access_token: "stored-access-token",
          can_manage_prices: true,
          can_view_prices: true,
          has_mercado_pago_integration: true,
          refresh_token: null,
          token_expires_at: null,
          tribe_id: "tribe-1",
        },
      ],
    }); });
    const repository = createRepository(execute);

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      prices: [
        {
          id: "price-1",
          status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
        },
      ],
    });
  });

  it("should expose update trial policy for synchronized Mercado Pago prices", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          ...createSubscriptionPriceRow({
            mercado_pago_preapproval_plan_id: "plan-1",
            trial_frequency: 21,
            trial_frequency_type: "days",
            tribe_id: "tribe-1",
          }),
          access_token: "access-token",
          can_manage_prices: true,
          refresh_token: null,
          token_expires_at: null,
        },
      ],
    }); });
    const repository = createRepository(execute);

    await expect(
      repository.getUpdateTrialPolicy({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      amountCents: 500000,
      hasMercadoPagoPreapprovalPlan: true,
      trialFrequency: 21,
      trialFrequencyType: "days",
    });
  });

  it("should list Mercado Pago health as requiring reconnection when token refresh fails", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          ...createSubscriptionPriceRow(),
          access_token: "stored-access-token",
          can_manage_prices: true,
          can_view_prices: true,
          has_mercado_pago_integration: true,
          mercado_pago_connection_payment_integration_id: "integration-1",
          payment_integration_id: "integration-1",
          refresh_token: "revoked-refresh-token",
          token_expires_at: "2026-05-06T13:05:00.000Z",
          tribe_id: "tribe-1",
        },
      ],
    }); });
    const refreshMercadoPagoAccessToken = vi.fn(async () => {
      throw new Error("Mercado Pago rejected refresh token");
    });
    const repository = createRepository(
      execute,
      vi.fn(async () => "plan-1"),
      refreshMercadoPagoAccessToken
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({ freeJoinIsCurrent: false, openFreeJoinEnabled: false,
      hasMercadoPagoIntegration: false,
      mercadoPagoConnectionStatus: "requires_reconnection",
      prices: [
        {
          id: "price-1",
        },
      ],
      viewerPermissions: {
        canManagePrices: true,
        canViewPrices: true,
      },
    });
    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith(
      "revoked-refresh-token"
    );
  });

  it("should keep Mercado Pago health connected when a concurrent refresh already persisted a fresh token", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (
        sqlText.includes(
          "where tribe_payment_integrations.tribe_id ="
        )
      ) {
        return {
          rows: [
            {
              access_token: "fresh-access-token",
              mercado_pago_connection_payment_integration_id: "integration-1",
              payment_integration_id: "integration-1",
              refresh_token: "new-refresh-token",
              token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
              tribe_id: "tribe-1",
            },
          ],
        };
      }

      return {
        rows: [
          {
            ...createSubscriptionPriceRow(),
            access_token: "stored-access-token",
            can_manage_prices: true,
            can_view_prices: true,
            has_mercado_pago_integration: true,
            mercado_pago_connection_payment_integration_id: "integration-1",
            payment_integration_id: "integration-1",
            refresh_token: "revoked-refresh-token",
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          },
        ],
      };
    });
    const refreshMercadoPagoAccessToken = vi.fn(async () => {
      throw new Error("Mercado Pago rejected rotated refresh token");
    });
    const repository = createRepository(
      execute,
      vi.fn(async () => "plan-1"),
      refreshMercadoPagoAccessToken
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      hasMercadoPagoIntegration: true,
      mercadoPagoConnectionStatus: "connected",
    });
    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith(
      "revoked-refresh-token"
    );
  });

  it("should list expired Mercado Pago integration without refresh token as requiring reconnection", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          ...createSubscriptionPriceRow(),
          access_token: "expired-access-token",
          can_manage_prices: true,
          can_view_prices: true,
          has_mercado_pago_integration: false,
          refresh_token: null,
          token_expires_at: "2026-05-06T12:00:00.000Z",
          tribe_id: "tribe-1",
        },
      ],
    }); });
    const refreshMercadoPagoAccessToken = vi.fn();
    const repository = createRepository(
      execute,
      vi.fn(async () => "plan-1"),
      refreshMercadoPagoAccessToken
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      hasMercadoPagoIntegration: false,
      mercadoPagoConnectionStatus: "requires_reconnection",
    });
    expect(refreshMercadoPagoAccessToken).not.toHaveBeenCalled();
  });

  it("clears the previous current price before marking another price as current", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("set is_current = tribe_subscription_prices.id =")) {
        throw new Error("unique current price violation");
      }

      if (sqlText.includes("set is_current = true")) {
        const returnsTrial =
          sqlText.includes("returning") && sqlText.includes("trial_frequency");

        return {
          rows: [
            createSubscriptionPriceRow({
              trial_frequency: returnsTrial ? 1 : null,
              trial_frequency_type: returnsTrial ? "months" : null,
            }),
          ],
        };
      }

      return {
        rows: [
          createSubscriptionPriceRow({
            is_current: false,
          }),
        ],
      };
    });
    const repository = createRepository(execute);

    await expect(
      repository.makeCurrent({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        id: "price-1",
        isCurrent: true,
        trial: {
          frequency: 1,
          frequencyType: "months",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
    });
  });

  it(
    "clears the free-join flag while marking a paid price as current",
    async () => {
      const executedSqlTexts: string[] = [];
      const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
        const sqlText = getSqlText(statement);

        executedSqlTexts.push(sqlText);

        if (sqlText.includes("set is_current = true")) {
          return {
            rows: [
              createSubscriptionPriceRow({
                trial_frequency: null,
                trial_frequency_type: null,
              }),
            ],
          };
        }

        if (sqlText.includes("set free_join_is_current = false")) {
          return { rows: [] };
        }

        if (sqlText.includes("set is_current = false")) {
          return { rows: [] };
        }

        return {
          rows: [
            createSubscriptionPriceRow({
              is_current: false,
            }),
          ],
        };
      });
      const repository = createRepository(execute);

      await expect(
        repository.makeCurrent({
          priceId: "price-1",
          tribeSlug: "matematica-pro",
        })
      ).resolves.toMatchObject({
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
      });

      const clearPreviousIndex = executedSqlTexts.findIndex((sqlText) =>
        sqlText.includes("set is_current = false")
      );
      const setCurrentIndex = executedSqlTexts.findIndex((sqlText) =>
        sqlText.includes("set is_current = true")
      );
      const clearFreeJoinIndex = executedSqlTexts.findIndex((sqlText) =>
        sqlText.includes("set free_join_is_current = false")
      );

      expect(clearPreviousIndex).toBeGreaterThan(0);
      expect(setCurrentIndex).toBeGreaterThan(clearPreviousIndex);
      expect(clearFreeJoinIndex).toBeGreaterThan(setCurrentIndex);
    }
  );

  it("does not clear free-join mode for prices without provider plans", async () => {
    const executedSqlTexts: string[] = [];
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      executedSqlTexts.push(sqlText);

      return {
        rows: [
          {
            status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound,
          },
        ],
      };
    });
    const repository = createRepository(execute);

    await expect(
      repository.makeCurrent({
        priceId: "price-without-provider-plan",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound,
    });
  });

  it(
    "marks the tribe as free-join current and clears any current paid price",
    async () => {
      const executedSqlTexts: string[] = [];
      const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
        const sqlText = getSqlText(statement);

        executedSqlTexts.push(sqlText);

        if (
          sqlText.includes("then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}") ||
          sqlText.includes("not exists (select 1 from target_tribe)")
        ) {
          return {
            rows: [
              {
                status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
              },
            ],
          };
        }

        if (sqlText.includes("update public.tribes")) {
          return {
            rows: [
              {
                status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
              },
            ],
          };
        }

        return { rows: [] };
      });
      const repository = createRepository(execute);

      await expect(
        repository.setFreeJoinAsCurrent({ tribeSlug: "matematica-pro" })
      ).resolves.toEqual({
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
      });

      const clearPaidPricesIndex = executedSqlTexts.findIndex((sqlText) =>
        sqlText.includes(
          "update public.tribe_subscription_prices\n        set is_current = false"
        )
      );
      const setFreeJoinIndex = executedSqlTexts.findIndex((sqlText) =>
        sqlText.includes("set free_join_is_current = true")
      );

      expect(clearPaidPricesIndex).toBeGreaterThanOrEqual(0);
      expect(setFreeJoinIndex).toBeGreaterThan(clearPaidPricesIndex);
    }
  );

  it(
    "returns freeJoinIsCurrent from the list query",
    async () => {
      const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
        rows: [
          {
            access_token: null,
            active_subscribers_count: 0,
            amount_cents: 0,
            can_manage_prices: true,
            can_view_prices: true,
            created_at: "2026-05-06T13:00:00.000Z",
            currency: "ARS",
            free_join_is_current: true,
            frequency: "monthly",
            id: null,
            is_current: false,
            name: null,
            refresh_token: null,
            status: "active" as const,
            token_expires_at: null,
            trial_frequency: null,
            trial_frequency_type: null,
            tribe_id: "tribe-1",
          },
        ],
      }); });
      const repository = createRepository(execute);

      await expect(
        repository.listByTribeSlug({ tribeSlug: "matematica-pro" })
      ).resolves.toMatchObject({
        freeJoinIsCurrent: true,
      });
    }
  );

  it("does not create a provider plan when reservation hits the price limit", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("reserved_price")) {
        return {
          rows: [
            {
              status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached,
            },
          ],
        };
      }

      return {
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            existing_price_count: 29,
            tribe_id: "tribe-1",
          },
        ],
      };
    });
    const createMercadoPagoPlan: Mock = vi.fn(async () => "plan-1");
    const repository = createRepository(execute, createMercadoPagoPlan);

    await expect(
      repository.create({ paymentIntegrationId: "integration-1", trialFrequency: null, trialFrequencyType: null,
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

  it("creates the Mercado Pago plan after the local price reservation finishes", async () => {
    const transactionEvents: string[] = [];
    const executeWithDatabase = vi.fn(async (callback) => {
      transactionEvents.push("transaction:start");

      const result = await callback({
        execute: vi.fn(async (statement) => {
          const sqlText = getSqlText(statement);

          if (sqlText.includes("reserved_price")) {
            return {
              rows: [
                {
                  reserved_price_id: "price-1",
                  status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
                },
              ],
            };
          }

          if (sqlText.includes("mercado_pago_preapproval_plan_id =")) {
            return {
              rows: [
                createSubscriptionPriceRow({
                  status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
                }),
              ],
            };
          }

          return {
            rows: [
              {
                access_token: "access-token",
                can_manage_prices: true,
                existing_price_count: 0,
                tribe_id: "tribe-1",
              },
            ],
          };
        }),
      } as never);

      transactionEvents.push("transaction:end");

      return result;
    });
    const createMercadoPagoPlan: Mock = vi.fn(async () => {
      transactionEvents.push("provider:create-plan");

      return "plan-1";
    });
    const repository = new PostgresTribeSubscriptionPriceRepository(
      executeWithDatabase,
      createMercadoPagoPlan,
      vi.fn(async () => ({
        amountCents: 500000,
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
        id: "plan-1",
        reason: "Plan mensual", trial: null,
        status: "active" as const,
      })),
      vi.fn(async () => ({
        amountCents: 500000,
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
        id: "plan-1",
        reason: "Plan mensual", trial: null,
        status: "active" as const,
      })),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      createPaidAdmissionResolutionWriter
    );

    await repository.create({ paymentIntegrationId: "integration-1",
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan mensual",
      trialFrequency: 7,
      trialFrequencyType: "days",
      tribeSlug: "matematica-pro",
    });

    expect(transactionEvents.slice(0, 3)).toEqual([
      "transaction:start",
      "transaction:end",
      "transaction:start",
    ]);
    expect(transactionEvents.slice(2, 5)).toEqual([
      "transaction:start",
      "transaction:end",
      "provider:create-plan",
    ]);
    expect(createMercadoPagoPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        backUrl: "https://tutribu.example.com/matematica-pro",
        externalReference: "tutribu:price:price-1",
        idempotencyKey:
          "tribe-price:price-1:matematica-pro:Plan mensual:500000:ARS:monthly",
        trialFrequency: 7,
        trialFrequencyType: "days",
      })
    );
  });

  it("promotes the only active paid price to current when activation finishes", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("sole_active_paid_price")) {
        return { rows: [{ promoted_price_id: "price-1" }] };
      }

      if (sqlText.includes("reserved_price")) {
        return {
          rows: [
            {
              reserved_price_id: "price-1",
              status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
            },
          ],
        };
      }

      if (sqlText.includes("mercado_pago_preapproval_plan_id =")) {
        return {
          rows: [
            createSubscriptionPriceRow({
              is_current: false,
              status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
            }),
          ],
        };
      }

      return {
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            existing_price_count: 0,
            tribe_id: "tribe-1",
          },
        ],
      };
    });
    const repository = createRepository(execute);

    const result = await repository.create({ paymentIntegrationId: "integration-1",
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan mensual",
      trialFrequency: 7,
      trialFrequencyType: "days",
      tribeSlug: "matematica-pro",
    });

    expect(result).toMatchObject({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
      price: expect.objectContaining({ id: "price-1", isCurrent: true }),
    });
  });

  it("keeps the new price non-current when other active paid prices already exist", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("sole_active_paid_price")) {
        return { rows: [{ promoted_price_id: null }] };
      }

      if (sqlText.includes("reserved_price")) {
        return {
          rows: [
            {
              reserved_price_id: "price-2",
              status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
            },
          ],
        };
      }

      if (sqlText.includes("mercado_pago_preapproval_plan_id =")) {
        return {
          rows: [
            createSubscriptionPriceRow({
              id: "price-2",
              is_current: false,
              status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
            }),
          ],
        };
      }

      return {
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            existing_price_count: 1,
            tribe_id: "tribe-1",
          },
        ],
      };
    });
    const repository = createRepository(execute);

    const result = await repository.create({ paymentIntegrationId: "integration-1",
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan adicional",
      trialFrequency: 7,
      trialFrequencyType: "days",
      tribeSlug: "matematica-pro",
    });

    expect(result).toMatchObject({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
      price: expect.objectContaining({ id: "price-2", isCurrent: false }),
    });
  });

  it("returns the current paid offer by slug only when free join is not the current option", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          amount_cents: 500000,
          currency: "ARS",
          frequency: "monthly",
          name: "Plan mensual",
        },
      ],
    }); });
    const repository = createRepository(execute);

    await expect(
      repository.getCurrentSubscriptionOffer({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({
      price: {
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
      },
      status: "available" as const,
    });
  });

  it("returns an unavailable offer when no current paid price is exposed", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({ rows: [] }); });
    const repository = createRepository(execute);

    await expect(
      repository.getCurrentSubscriptionOffer({ tribeSlug: "matematica-pro" })
    ).resolves.toEqual({ status: "unavailable" as const });
  });

  it("should keep Mercado Pago account metadata in created price responses", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("reserved_price")) {
        return {
          rows: [
            {
              reserved_price_id: "price-1",
              status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
            },
          ],
        };
      }

      if (sqlText.includes("mercado_pago_preapproval_plan_id =")) {
        const includesPaymentAccountMetadata = sqlText.includes(
          "price_payment_integration.account_label"
        );

        return {
          rows: [
            createSubscriptionPriceRow({
              ...(includesPaymentAccountMetadata
                ? {
                    mercado_pago_account_email: "leader@example.com",
                    mercado_pago_account_label: "Cuenta principal",
                    payment_integration_id: "integration-1",
                    provider_account_id: "collector-1",
                  }
                : {}),
              status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
            }),
          ],
        };
      }

      return {
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            existing_price_count: 0,
            payment_integration_id: "integration-1",
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      };
    });
    const repository = createRepository(execute);

    await expect(
      repository.create({ trialFrequency: null, trialFrequencyType: null,
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
        paymentIntegrationId: "integration-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        mercadoPagoAccountEmail: "leader@example.com",
        mercadoPagoAccountLabel: "Cuenta principal",
        paymentIntegrationId: "integration-1",
        providerAccountId: "collector-1",
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
    });
  });

  it("should update the same provider plan and local price when the amount changes", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              amount_cents: 500000,
              is_current: false,
              mercado_pago_preapproval_plan_id: "plan-1",
              trial_frequency: 21,
              trial_frequency_type: "days",
              tribe_id: "tribe-1",
            }),
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            amount_cents: 600000,
            id: "price-1",
            is_current: true,
            name: "Plan actualizado",
            status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
            trial_frequency: 21,
            trial_frequency_type: "days",
          }),
        ],
      });
    const createMercadoPagoPlan: Mock = vi.fn();
    const updateMercadoPagoPlan: Mock = vi.fn(async () => ({
      amountCents: 600000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan actualizado",
      status: "active" as const,
      trial: {
        frequency: 21,
        frequencyType: "days" as const,
      },
    }));
    const repository = createRepository(
      execute,
      createMercadoPagoPlan,
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      updateMercadoPagoPlan
    );

    await expect(
      repository.update({
        amountCents: 600000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan actualizado",
        priceId: "price-1",
        trialFrequency: 21,
        trialFrequencyType: "days",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        amountCents: 600000,
        id: "price-1",
        name: "Plan actualizado",
        trial: {
          frequency: 21,
          frequencyType: "days",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });

    expect(createMercadoPagoPlan).not.toHaveBeenCalled();
    expect(updateMercadoPagoPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 600000,
        currency: "ARS",
        frequency: "monthly",
        preapprovalPlanId: "plan-1",
        trialFrequency: 21,
        trialFrequencyType: "days",
      })
    );
  });

  it("should update Mercado Pago and local storage when the trial period changes", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: "plan-1",
              trial_frequency: 7,
              trial_frequency_type: "days",
              tribe_id: "tribe-1",
            }),
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
            trial_frequency: 14,
            trial_frequency_type: "days",
          }),
        ],
      });
    const updateMercadoPagoPlan: Mock = vi.fn(async () => ({
      amountCents: 500000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "active" as const,
      trial: {
        frequency: 14,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      updateMercadoPagoPlan
    );

    await expect(
      repository.update({
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual",
        priceId: "price-1",
        trialFrequency: 14,
        trialFrequencyType: "days",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        trial: {
          frequency: 14,
          frequencyType: "days",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });
    expect(updateMercadoPagoPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        trialFrequency: 14,
        trialFrequencyType: "days",
      })
    );
  });

  it("should reject paused price updates before mutating the provider plan", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          ...createSubscriptionPriceRow({
            mercado_pago_preapproval_plan_id: "plan-1",
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
            tribe_id: "tribe-1",
          }),
          access_token: "access-token",
          can_manage_prices: true,
          refresh_token: null,
          token_expires_at: null,
        },
      ],
    });
    const updateMercadoPagoPlan: Mock = vi.fn();
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      updateMercadoPagoPlan
    );

    await expect(
      repository.update({
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan pausado",
        priceId: "price-1",
        trialFrequency: null,
        trialFrequencyType: null,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
    });

    expect(updateMercadoPagoPlan).not.toHaveBeenCalled();
  });

  it("should preserve the stored trial period when update fields are omitted", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: "plan-1",
              trial_frequency: 7,
              trial_frequency_type: "days",
              tribe_id: "tribe-1",
            }),
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
            trial_frequency: 7,
            trial_frequency_type: "days",
          }),
        ],
      });
    const updateMercadoPagoPlan: Mock = vi.fn(async () => ({
      amountCents: 500000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual actualizado",
      status: "active" as const,
      trial: {
        frequency: 7,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      updateMercadoPagoPlan
    );

    await expect(
      repository.update({
        amountCents: 500000,
        currency: "ARS",
        frequency: "monthly",
        name: "Plan mensual actualizado",
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        trial: {
          frequency: 7,
          frequencyType: "days",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.updated,
    });
    expect(updateMercadoPagoPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        trialFrequency: 7,
        trialFrequencyType: "days",
      })
    );
  });

  it("refreshes expired Mercado Pago tokens before creating provider plans", async () => {
    const expiredTokenDate = new Date(Date.now() - 60_000).toISOString();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "expired-access-token",
            can_manage_prices: true,
            existing_price_count: 0,
            payment_integration_id: "integration-1",
            refresh_token: "refresh-token",
            token_expires_at: expiredTokenDate,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            reserved_price_id: "price-1",
            status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
          }),
        ],
      });
    const createMercadoPagoPlan: Mock = vi.fn(async () => "plan-1");
    const refreshMercadoPagoAccessToken = vi.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "seller-1",
      refreshToken: "new-refresh-token",
    }));
    const repository = createRepository(
      execute,
      createMercadoPagoPlan,
      refreshMercadoPagoAccessToken
    );

    await expect(
      repository.create({ paymentIntegrationId: "integration-1", trialFrequency: null, trialFrequencyType: null,
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
        backUrl: "https://tutribu.example.com/matematica-pro",
      })
    );
  });

  it("should keep active prices when the provider plan still exists", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [createSubscriptionPriceRow()],
      });
    const getMercadoPagoPlanStatus: Mock = vi.fn(async () => "active");
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      getMercadoPagoPlanStatus
    );

    await expect(
      repository.verifyProviderPlans({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({ freeJoinIsCurrent: false,
      canceledPriceIds: [],
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    });
    expect(getMercadoPagoPlanStatus).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalPlanId: "plan-1",
    });
  });

  it("should mark a local price as canceled when the provider plan is missing", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              is_current: false,
              status: "canceled" as const,
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            free_join_is_current: true,
            is_current: false,
            status: "canceled" as const,
          }),
        ],
      });
    const getMercadoPagoPlanStatus: Mock = vi.fn(async () => null);
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      getMercadoPagoPlanStatus
    );

    await expect(
      repository.verifyProviderPlans({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      canceledPriceIds: ["price-1"],
      freeJoinIsCurrent: true,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    });
  });

  it("should reactivate paused local prices when manual provider verification finds an active plan", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            is_current: false,
            mercado_pago_preapproval_plan_id: "plan-1",
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            is_current: false,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.active,
          }),
        ],
      });
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active")
    );

    await expect(
      repository.verifyProviderPlan({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        id: "price-1",
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.active,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("should cancel paused local prices when manual provider verification finds a canceled plan", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            is_current: false,
            mercado_pago_preapproval_plan_id: "plan-1",
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            is_current: false,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            free_join_is_current: true,
            is_current: false,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
          }),
        ],
      });
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "canceled")
    );

    await expect(
      repository.verifyProviderPlan({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        id: "price-1",
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("should restore free-join mode when provider verification pauses the current paid price", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            is_current: true,
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            is_current: false,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            free_join_is_current: true,
            is_current: false,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
          }),
        ],
      });
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "paused")
    );

    await expect(
      repository.verifyProviderPlan({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      freeJoinIsCurrent: true,
      price: {
        isCurrent: false,
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("should restore free-join mode when provider verification cancels the current paid price", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            is_current: true,
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            is_current: false,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            free_join_is_current: true,
            is_current: false,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
          }),
        ],
      });
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => null)
    );

    await expect(
      repository.verifyProviderPlan({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      freeJoinIsCurrent: true,
      price: {
        isCurrent: false,
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("should keep the Mercado Pago plan identifier when provider verification cancels a local price", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("set") && sqlText.includes("mercado_pago_preapproval_plan_id = null")) {
        throw new Error("provider plan id must be preserved");
      }

      if (sqlText.includes("access_token")) {
        return {
          rows: [
            {
              access_token: "access-token",
              can_manage_prices: true,
              refresh_token: null,
              token_expires_at: null,
              tribe_id: "tribe-1",
            },
          ],
        };
      }

      if (
        sqlText.includes("mercado_pago_preapproval_plan_id") &&
        !sqlText.includes("update public.tribe_subscription_prices")
      ) {
        return {
          rows: [
            createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: "plan-1",
            }),
          ],
        };
      }

      const returnsTrial = sqlText.includes("updated_price.trial_frequency");

      return {
        rows: [
          createSubscriptionPriceRow({
            is_current: false,
            status: "canceled" as const,
            trial_frequency: returnsTrial ? 1 : null,
            trial_frequency_type: returnsTrial ? "months" : null,
          }),
        ],
      };
    });
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => null)
    );

    await expect(
      repository.verifyProviderPlan({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        status: "canceled" as const,
        trial: {
          frequency: 1,
          frequencyType: "months",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("should not query Mercado Pago when no active local provider plan exists", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });
    const getMercadoPagoPlanStatus: Mock = vi.fn(async () => "active");
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      getMercadoPagoPlanStatus
    );

    await expect(
      repository.verifyProviderPlan({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound,
    });
    expect(getMercadoPagoPlanStatus).not.toHaveBeenCalled();
  });

  it("should read trial fields when provider plan verification returns the local price", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [createSubscriptionPriceRow()],
      });
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active")
    );

    await expect(
      repository.verifyProviderPlan({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        trial: {
          frequency: 7,
          frequencyType: "days",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("should not call Mercado Pago when the viewer cannot manage prices", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          access_token: "access-token",
          can_manage_prices: false,
          tribe_id: "tribe-1",
        },
      ],
    }); });
    const getMercadoPagoPlanStatus: Mock = vi.fn(async () => "active");
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      getMercadoPagoPlanStatus
    );

    await expect(
      repository.verifyProviderPlan({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
    });
    expect(getMercadoPagoPlanStatus).not.toHaveBeenCalled();
  });

  it("should reconcile canceled local subscriber rows when Mercado Pago reports them as canceled", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            active_subscribers_count: 1,
            is_current: false,
            mercado_pago_preapproval_plan_id: "plan-1",
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            mercado_pago_preapproval_id: "subscription-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            active_subscribers_count: 0,
            is_current: false,
            mercado_pago_preapproval_plan_id: "plan-1",
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
          }),
        ],
      });
    const getMercadoPagoSubscriptionStatus: Mock = vi.fn(async () => "cancelled");
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "canceled"),
      getMercadoPagoSubscriptionStatus
    );

    await expect(
      repository.reconcileProviderSubscribers({
        priceId: "price-1",
        source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        activeSubscribersCount: 0,
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
      },
      providerActiveSubscribersCount: 0,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    });
    expect(getMercadoPagoSubscriptionStatus).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalId: "subscription-1",
    });
  });

  it("should keep authorized pending and paused provider subscriptions associated while only authorized grants access", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            active_subscribers_count: 3,
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            mercado_pago_preapproval_id: "subscription-1",
          },
          {
            mercado_pago_preapproval_id: "subscription-2",
          },
          {
            mercado_pago_preapproval_id: "subscription-3",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            active_subscribers_count: 3,
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
        ],
      });
    const getMercadoPagoSubscriptionStatus = vi
      .fn()
      .mockResolvedValueOnce("authorized")
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("paused");
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      getMercadoPagoSubscriptionStatus
    );

    await expect(
      repository.reconcileProviderSubscribers({
        priceId: "price-1",
        source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        activeSubscribersCount: 3,
      },
      providerActiveSubscribersCount: 3,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 3,
    });
  });

  it("should return provider subscriber count with the reconciled local association count", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            mercado_pago_preapproval_id: "subscription-1",
          },
          {
            mercado_pago_preapproval_id: "subscription-2",
          },
          {
            mercado_pago_preapproval_id: "subscription-3",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            active_subscribers_count: 2,
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
        ],
      });
    const getMercadoPagoSubscriptionStatus = vi
      .fn()
      .mockResolvedValueOnce("authorized")
      .mockResolvedValueOnce("paused")
      .mockResolvedValueOnce("canceled");
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      getMercadoPagoSubscriptionStatus
    );

    await expect(
      repository.reconcileProviderSubscribers({
        priceId: "price-1",
        source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        activeSubscribersCount: 2,
      },
      providerActiveSubscribersCount: 2,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 3,
    });
    expect(getMercadoPagoSubscriptionStatus).toHaveBeenCalledTimes(3);
  });

  it("should resolve canceled prices when reconciling provider subscribers", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            mercado_pago_preapproval_plan_id: "plan-1",
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            mercado_pago_preapproval_id: "subscription-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            mercado_pago_preapproval_plan_id: "plan-1",
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
          }),
        ],
      });
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "canceled"),
      vi.fn(async () => "cancelled")
    );

    await expect(
      repository.reconcileProviderSubscribers({
        priceId: "price-1",
        source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("should load provider plan verification tokens from each price account", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "primary-access-token",
            can_manage_prices: true,
            payment_integration_id: "integration-1",
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            access_token: "secondary-access-token",
            mercado_pago_preapproval_plan_id: "plan-2",
            payment_integration_id: "integration-2",
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            access_token: "secondary-access-token",
            mercado_pago_preapproval_plan_id: "plan-2",
            payment_integration_id: "integration-2",
          }),
        ],
      });
    const getMercadoPagoPlanStatus: Mock = vi.fn(async () => "active");
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      getMercadoPagoPlanStatus
    );

    await repository.verifyProviderPlans({ tribeSlug: "matematica-pro" });

    expect(getMercadoPagoPlanStatus).toHaveBeenCalledWith({
      accessToken: "secondary-access-token",
      preapprovalPlanId: "plan-2",
    });
  });

  it("should refresh provider plan account tokens before verification", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "expired-access-token",
            can_manage_prices: true,
            payment_integration_id: "integration-1",
            refresh_token: "refresh-token",
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            access_token: "expired-access-token",
            mercado_pago_preapproval_plan_id: "plan-1",
            payment_integration_id: "integration-1",
            refresh_token: "refresh-token",
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          }),
        ],
      })
      .mockResolvedValue({ rows: [] });
    const refreshMercadoPagoAccessToken = vi.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "collector-1",
      refreshToken: "new-refresh-token",
    }));
    const getMercadoPagoPlanStatus: Mock = vi.fn(async () => "active");
    const repository = createRepository(
      execute,
      vi.fn(),
      refreshMercadoPagoAccessToken,
      getMercadoPagoPlanStatus
    );

    await repository.verifyProviderPlans({ tribeSlug: "matematica-pro" });

    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith("refresh-token");
    expect(getMercadoPagoPlanStatus).toHaveBeenCalledWith({
      accessToken: "fresh-access-token",
      preapprovalPlanId: "plan-1",
    });
  });

  it("should reuse a refreshed account token when verifying multiple provider plans from the same account", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "expired-access-token",
            can_manage_prices: true,
            payment_integration_id: "integration-1",
            refresh_token: "rotating-refresh-token",
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            access_token: "expired-access-token",
            id: "price-1",
            mercado_pago_preapproval_plan_id: "plan-1",
            payment_integration_id: "integration-1",
            refresh_token: "rotating-refresh-token",
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          }),
          createSubscriptionPriceRow({
            access_token: "expired-access-token",
            id: "price-2",
            mercado_pago_preapproval_plan_id: "plan-2",
            payment_integration_id: "integration-1",
            refresh_token: "rotating-refresh-token",
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            access_token: "fresh-access-token",
            can_manage_prices: true,
            can_view_prices: true,
            mercado_pago_preapproval_plan_id: "plan-1",
            payment_integration_id: "integration-1",
            refresh_token: "rotated-refresh-token",
            token_expires_at: null,
            tribe_id: "tribe-1",
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "fresh-access-token",
            account_label: "Cuenta principal",
            id: "integration-1",
            provider_account_email: "leader@example.com",
            provider_account_id: "collector-1",
            refresh_token: null,
            status: "connected" as const,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      });
    const refreshMercadoPagoAccessToken = vi.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "collector-1",
      refreshToken: "rotated-refresh-token",
    }));
    const getMercadoPagoPlanStatus: Mock = vi.fn(async () => "active");
    const repository = createRepository(
      execute,
      vi.fn(),
      refreshMercadoPagoAccessToken,
      getMercadoPagoPlanStatus
    );

    await expect(
      repository.verifyProviderPlans({ tribeSlug: "matematica-pro" })
    ).resolves.toMatchObject({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 2,
    });
    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledTimes(1);
    expect(getMercadoPagoPlanStatus).toHaveBeenNthCalledWith(1, {
      accessToken: "fresh-access-token",
      preapprovalPlanId: "plan-1",
    });
    expect(getMercadoPagoPlanStatus).toHaveBeenNthCalledWith(2, {
      accessToken: "fresh-access-token",
      preapprovalPlanId: "plan-2",
    });
  });

  it("should refresh subscriber diagnostics account tokens before reading provider subscriptions", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "expired-access-token",
            can_manage_prices: true,
            payment_integration_id: "integration-1",
            refresh_token: "refresh-token",
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "expired-access-token",
            mercado_pago_preapproval_id: "subscriber-1",
            payment_integration_id: "integration-1",
            refresh_token: "refresh-token",
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            last_reconciled_at: "2026-05-12T01:00:00.000Z",
            local_active_subscribers_count: 1,
            mercado_pago_authorized_subscribers_count: 1,
            mercado_pago_canceled_or_missing_subscribers_count: 0,
            mercado_pago_paused_subscribers_count: 0,
            mercado_pago_pending_subscribers_count: 0,
            target_tribe_id: "tribe-1",
          },
        ],
      });
    const refreshMercadoPagoAccessToken = vi.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "collector-1",
      refreshToken: "new-refresh-token",
    }));
    const getMercadoPagoSubscriptionStatus: Mock = vi.fn(async () => "authorized");
    const repository = createRepository(
      execute,
      vi.fn(),
      refreshMercadoPagoAccessToken,
      vi.fn(),
      getMercadoPagoSubscriptionStatus
    );

    await expect(
      repository.reconcileSubscriberDiagnostics({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    });
    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith("refresh-token");
    expect(getMercadoPagoSubscriptionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "fresh-access-token",
        preapprovalId: "subscriber-1",
      })
    );
  });

  it("does not leave an idempotent lock when the provider plan call fails before registration", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("insert into public.subscription_idempotency_operations")) {
        return {
          rows: [
            {
              id: "operation-1",
            },
          ],
        };
      }

      return {
        rows: [
          {
            ...createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: "plan-1",
              tribe_id: "tribe-1",
            }),
            access_token: "access-token",
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      };
    });
    const getMercadoPagoPlan: Mock = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      vi.fn(),
      getMercadoPagoPlan
    );

    await expect(
      repository.syncProviderPlan({
        eventId: "event-1",
        resourceId: "plan-1",
        topic: "subscription_preapproval_plan.updated",
      })
    ).rejects.toThrow("provider unavailable");
    expect(getMercadoPagoPlan).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalPlanId: "plan-1",
    });
  });

  it("should restore free-join mode when a provider webhook cancels the current paid price", async () => {
    const executedSqlTexts: string[] = [];
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      executedSqlTexts.push(sqlText);

      if (sqlText.includes("insert into public.subscription_idempotency_operations")) {
        return {
          rows: [
            {
              id: "operation-1",
            },
          ],
        };
      }

      if (sqlText.includes("set is_current = false")) {
        return { rows: [] };
      }

      if (sqlText.includes("update public.tribe_subscription_prices")) {
        return {
          rows: [
            createSubscriptionPriceRow({
              is_current: false,
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
            }),
          ],
        };
      }

      return {
        rows: [
          {
            ...createSubscriptionPriceRow({
              is_current: true,
              mercado_pago_preapproval_plan_id: "plan-1",
              tribe_id: "tribe-1",
            }),
            access_token: "access-token",
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      };
    });
    const getMercadoPagoPlan: Mock = vi.fn(async () => ({
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual", trial: null,
      status: "cancelled" as const,
    }));
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      vi.fn(),
      getMercadoPagoPlan
    );

    await expect(
      repository.syncProviderPlan({
        eventId: "event-1",
        resourceId: "plan-1",
        topic: "subscription_preapproval_plan.updated",
      })
    ).resolves.toMatchObject({
      price: {
        isCurrent: false,
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("should sync provider plan webhooks with the RLS-safe price context", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("update public.tribe_subscription_prices")) {
        const includesPaymentIntegrationReturning = /returning[^)]*payment_integration_id/.test(
          sqlText
        );

        return {
          rows: [
            createSubscriptionPriceRow({
              amount_cents: 700000,
              ...(includesPaymentIntegrationReturning
                ? {
                    mercado_pago_account_label: "Cuenta principal",
                    payment_integration_id: "integration-1",
                  }
                : {
                    payment_integration_id: undefined,
                  }),
              name: "Plan actualizado",
              trial_frequency: 21,
              trial_frequency_type: "days",
            }),
          ],
        };
      }

      if (sqlText.includes("from public.tribe_subscription_prices")) {
        if (sqlText.includes("inner join public.tribes")) {
          return { rows: [] };
        }

        return {
          rows: [
            {
              ...createSubscriptionPriceRow({
                mercado_pago_preapproval_plan_id: "plan-1",
                tribe_id: "tribe-1",
              }),
              access_token: "access-token",
              refresh_token: null,
              token_expires_at: null,
            },
          ],
        };
      }

      if (sqlText.includes("insert into public.subscription_idempotency_operations")) {
        return {
          rows: [
            {
              id: "operation-1",
            },
          ],
        };
      }

      return {
        rows: [
          createSubscriptionPriceRow({
            name: "Plan actualizado",
          }),
        ],
      };
    });
    const getMercadoPagoPlan: Mock = vi.fn(async () => ({
      amountCents: 700000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan actualizado",
      status: "active" as const,
      trial: {
        frequency: 21,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      vi.fn(),
      getMercadoPagoPlan
    );

    await expect(
      repository.syncProviderPlan({
        eventId: "event-1",
        resourceId: "plan-1",
        topic: "subscription_preapproval_plan.updated",
      })
    ).resolves.toMatchObject({
      price: {
        amountCents: 700000,
        mercadoPagoAccountLabel: "Cuenta principal",
        name: "Plan actualizado",
        paymentIntegrationId: "integration-1",
        trial: {
          frequency: 21,
          frequencyType: "days",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
    expect(getMercadoPagoPlan).toHaveBeenCalledWith({
      accessToken: "access-token",
      preapprovalPlanId: "plan-1",
    });
  });

  it("should pause local prices when Mercado Pago pauses provider plans", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (
        sqlText.includes("updated_price as") &&
        sqlText.includes("status =") &&
        sqlText.includes("is_current = false")
      ) {
        return {
          rows: [
            createSubscriptionPriceRow({
              is_current: false,
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
            }),
          ],
        };
      }

      if (sqlText.includes("from public.tribe_subscription_prices")) {
        return {
          rows: [
            {
              ...createSubscriptionPriceRow({
                is_current: true,
                mercado_pago_preapproval_plan_id: "plan-1",
                tribe_id: "tribe-1",
              }),
              access_token: "access-token",
              refresh_token: null,
              token_expires_at: null,
            },
          ],
        };
      }

      if (sqlText.includes("insert into public.subscription_idempotency_operations")) {
        return {
          rows: [
            {
              id: "operation-1",
            },
          ],
        };
      }

      return { rows: [] };
    });
    const getMercadoPagoPlan: Mock = vi.fn(async () => ({
      amountCents: 500000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "paused" as const,
      trial: null,
    }));
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      vi.fn(),
      getMercadoPagoPlan
    );

    await expect(
      repository.syncProviderPlan({
        eventId: "event-1",
        resourceId: "plan-1",
        topic: "subscription_preapproval_plan.updated",
      })
    ).resolves.toMatchObject({
      price: {
        isCurrent: false,
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("returns verified without writing when the provider plan webhook matches the current local price", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("insert into public.subscription_idempotency_operations")) {
        return { rows: [] };
      }

      if (sqlText.includes("from public.tribe_subscription_prices")) {
        return {
          rows: [
            {
              ...createSubscriptionPriceRow({
                amount_cents: 500000,
                currency: "ARS",
                mercado_pago_preapproval_plan_id: "plan-1",
                name: "Plan mensual",
                trial_frequency: 7,
                trial_frequency_type: "days",
                tribe_id: "tribe-1",
              }),
              access_token: "access-token",
              refresh_token: null,
              token_expires_at: null,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const getMercadoPagoPlan: Mock = vi.fn(async () => ({
      amountCents: 500000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "active" as const,
      trial: {
        frequency: 7,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      vi.fn(),
      getMercadoPagoPlan
    );

    await expect(
      repository.syncProviderPlan({
        eventId: "event-2",
        resourceId: "plan-1",
        topic: "subscription_preapproval_plan.updated",
      })
    ).resolves.toMatchObject({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("re-applies provider plan changes after oscillation when the local price diverges from the target", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("insert into public.subscription_idempotency_operations")) {
        return { rows: [] };
      }

      if (sqlText.includes("update public.tribe_subscription_prices")) {
        return {
          rows: [
            createSubscriptionPriceRow({
              amount_cents: 500000,
              name: "Plan mensual",
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.active,
            }),
          ],
        };
      }

      if (sqlText.includes("from public.tribe_subscription_prices")) {
        return {
          rows: [
            {
              ...createSubscriptionPriceRow({
                amount_cents: 500000,
                currency: "ARS",
                is_current: false,
                mercado_pago_preapproval_plan_id: "plan-1",
                name: "Plan mensual",
                status: TRIBE_SUBSCRIPTION_PRICE_STATUS.paused,
                trial_frequency: 7,
                trial_frequency_type: "days",
                tribe_id: "tribe-1",
              }),
              access_token: "access-token",
              refresh_token: null,
              token_expires_at: null,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const getMercadoPagoPlan: Mock = vi.fn(async () => ({
      amountCents: 500000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "active" as const,
      trial: {
        frequency: 7,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      vi.fn(),
      getMercadoPagoPlan
    );

    await expect(
      repository.syncProviderPlan({
        eventId: "event-3",
        resourceId: "plan-1",
        topic: "subscription_preapproval_plan.updated",
      })
    ).resolves.toMatchObject({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    });
  });

  it("keys the provider plan webhook idempotency by plan and content hash", async () => {
    const insertedKeys: string[] = [];
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("insert into public.subscription_idempotency_operations")) {
        const queryChunks = (statement as { queryChunks?: unknown[] })
          ?.queryChunks ?? [];

        for (const chunk of queryChunks) {
          if (
            typeof chunk === "string" &&
            chunk.startsWith("mercado-pago-plan-webhook:")
          ) {
            insertedKeys.push(chunk);
          }
        }

        return { rows: [{ id: "operation-1" }] };
      }

      if (sqlText.includes("from public.tribe_subscription_prices")) {
        return {
          rows: [
            {
              ...createSubscriptionPriceRow({
                mercado_pago_preapproval_plan_id: "plan-1",
                tribe_id: "tribe-1",
              }),
              access_token: "access-token",
              refresh_token: null,
              token_expires_at: null,
            },
          ],
        };
      }

      if (sqlText.includes("update public.tribe_subscription_prices")) {
        return {
          rows: [createSubscriptionPriceRow({ amount_cents: 800000 })],
        };
      }

      return { rows: [] };
    });
    const getMercadoPagoPlan: Mock = vi.fn(async () => ({
      amountCents: 800000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "active" as const,
      trial: {
        frequency: 7,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      vi.fn(),
      getMercadoPagoPlan
    );

    await repository.syncProviderPlan({
      eventId: "event-4",
      resourceId: "plan-1",
      topic: "subscription_preapproval_plan.updated",
    });

    expect(insertedKeys).toHaveLength(1);
    const firstKey = insertedKeys[0] ?? "";
    expect(firstKey.startsWith("mercado-pago-plan-webhook:plan-1:")).toBe(true);
    expect(firstKey.split(":").length).toBe(3);
    expect(firstKey.split(":")[2]).toMatch(/^[0-9a-f]{16}$/);
  });

  it("should classify active subscriber diagnostics without provider identifiers as missing", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          last_reconciled_at: "2026-05-12T01:00:00.000Z",
          local_active_subscribers_count: "2",
          mercado_pago_authorized_subscribers_count: "2",
          mercado_pago_canceled_or_missing_subscribers_count: "1",
          mercado_pago_paused_subscribers_count: "4",
          mercado_pago_pending_subscribers_count: "3",
          target_tribe_id: "tribe-1",
        },
      ],
    });
    const repository = createRepository(execute);

    await expect(
      repository.getSubscriberDiagnostics({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      lastReconciledAt: "2026-05-12T01:00:00.000Z",
      localActiveSubscribersCount: 2,
      mercadoPagoAuthorizedSubscribersCount: 2,
      mercadoPagoCanceledOrMissingSubscribersCount: 1,
      mercadoPagoPausedSubscribersCount: 4,
      mercadoPagoPendingSubscribersCount: 3,
    });
  });

  it("should return null when aggregate diagnostics have no authorized target tribe", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          last_reconciled_at: null,
          local_active_subscribers_count: "0",
          mercado_pago_authorized_subscribers_count: "0",
          mercado_pago_canceled_or_missing_subscribers_count: "0",
          mercado_pago_paused_subscribers_count: "0",
          mercado_pago_pending_subscribers_count: "0",
          target_tribe_id: null,
        },
      ],
    });
    const repository = createRepository(execute);

    await expect(
      repository.getSubscriberDiagnostics({
        tribeSlug: "unknown-tribe",
      })
    ).resolves.toBeNull();
  });

  it("should reconcile aggregate subscriber diagnostics with authorized pending paused and missing counts", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "account-a-access-token",
            mercado_pago_preapproval_id: "subscription-1",
          },
          {
            access_token: "account-a-access-token",
            mercado_pago_preapproval_id: "subscription-2",
          },
          {
            access_token: "account-b-access-token",
            mercado_pago_preapproval_id: "subscription-3",
          },
          {
            access_token: "account-b-access-token",
            mercado_pago_preapproval_id: "subscription-4",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            last_reconciled_at: "2026-05-12T01:05:00.000Z",
            local_active_subscribers_count: 1,
            mercado_pago_authorized_subscribers_count: 1,
            mercado_pago_canceled_or_missing_subscribers_count: 1,
            mercado_pago_paused_subscribers_count: 1,
            mercado_pago_pending_subscribers_count: 1,
            target_tribe_id: "tribe-1",
          },
        ],
      });
    const getMercadoPagoSubscriptionStatus = vi
      .fn()
      .mockResolvedValueOnce("authorized")
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("paused")
      .mockResolvedValueOnce(null);
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      getMercadoPagoSubscriptionStatus
    );

    await expect(
      repository.reconcileSubscriberDiagnostics({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      diagnostics: {
        lastReconciledAt: "2026-05-12T01:05:00.000Z",
        localActiveSubscribersCount: 1,
        mercadoPagoAuthorizedSubscribersCount: 1,
        mercadoPagoCanceledOrMissingSubscribersCount: 1,
        mercadoPagoPausedSubscribersCount: 1,
        mercadoPagoPendingSubscribersCount: 1,
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 4,
    });
    expect(getMercadoPagoSubscriptionStatus).toHaveBeenCalledTimes(4);
    expect(getMercadoPagoSubscriptionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "account-a-access-token",
        preapprovalId: "subscription-1",
      })
    );
    expect(getMercadoPagoSubscriptionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "account-b-access-token",
        preapprovalId: "subscription-3",
      })
    );
  });

  it("should keep linked invitations as the deletion blocker even when subscribers exist", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("from public.tribe_invitations")) {
        return {
          rows: [
            {
              id: "invitation-1",
            },
          ],
        };
      }

      return {
        rows: [
          {
            ...createSubscriptionPriceRow({
              active_subscribers_count: 1,
              mercado_pago_preapproval_plan_id: "plan-1",
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
              tribe_id: "tribe-1",
            }),
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      };
    });
    const updateMercadoPagoPlan: Mock = vi.fn();
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "active"),
      vi.fn(async () => "authorized"),
      updateMercadoPagoPlan
    );

    await expect(
      repository.delete({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      linkedInvitationIds: ["invitation-1"],
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasLinkedInvitations,
    });
    expect(updateMercadoPagoPlan).not.toHaveBeenCalled();
  });

  it("should delete canceled local prices when the provider plan link is already missing", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: null,
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
              tribe_id: "tribe-1",
            }),
            access_token: null,
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            was_deleted: true,
          },
        ],
      });
    const getMercadoPagoPlanStatus: Mock = vi.fn();
    const getMercadoPagoSubscriptionStatus: Mock = vi.fn();
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      getMercadoPagoPlanStatus,
      getMercadoPagoSubscriptionStatus
    );

    await expect(
      repository.delete({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted,
    });
    expect(getMercadoPagoPlanStatus).not.toHaveBeenCalled();
    expect(getMercadoPagoSubscriptionStatus).not.toHaveBeenCalled();
  });

  it("should block deleting canceled prices when the provider plan is paused", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: "plan-1",
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
              tribe_id: "tribe-1",
            }),
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            was_deleted: true,
          },
        ],
      });
    const getMercadoPagoPlanStatus: Mock = vi.fn(async () => "paused");
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      getMercadoPagoPlanStatus,
      vi.fn()
    );

    await expect(
      repository.delete({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
    });
    expect(getMercadoPagoPlanStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        preapprovalPlanId: "plan-1",
      })
    );
  });

  it("should revalidate invitation reassignment targets inside delete transactions", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: null,
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
              tribe_id: "tribe-1",
            }),
            access_token: null,
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "invitation-1" }] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "invitation-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn()
    );

    await expect(
      repository.deleteWithInvitationActions({
        invitationActions: [
          {
            action: "switch_to_specific",
            invitationId: "invitation-1",
            targetPriceId: "target-price-1",
          },
        ],
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput,
    });
  });

  it("should block deleting paused provider plans before applying invitation actions", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: "plan-1",
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
              tribe_id: "tribe-1",
            }),
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "invitation-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "invitation-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 0 }] })
      .mockResolvedValueOnce({ rows: [{ was_deleted: true }] });
    const getMercadoPagoPlanStatus: Mock = vi.fn(async () => "paused");
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      getMercadoPagoPlanStatus,
      vi.fn()
    );

    await expect(
      repository.deleteWithInvitationActions({
        invitationActions: [
          {
            action: "revoke",
            invitationId: "invitation-1",
          },
        ],
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
    });
    expect(getMercadoPagoPlanStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        preapprovalPlanId: "plan-1",
      })
    );
  });

  it("should detach member subscriptions when deleting canceled prices with invitation actions", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: null,
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
              tribe_id: "tribe-1",
            }),
            access_token: null,
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "invitation-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "invitation-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 0 }] })
      .mockResolvedValueOnce({ rows: [{ was_deleted: true }] });
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn()
    );

    await expect(
      repository.deleteWithInvitationActions({
        invitationActions: [
          {
            action: "revoke",
            invitationId: "invitation-1",
          },
        ],
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted,
    });
  });

  it("should delete missing provider-plan prices even when historical provider subscribers are still attached", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: null,
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
              tribe_id: "tribe-1",
            }),
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            was_deleted: true,
          },
        ],
      });
    const getMercadoPagoPlanStatus: Mock = vi.fn();
    const getMercadoPagoSubscriptionStatus: Mock = vi.fn(async () => "authorized");
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      getMercadoPagoPlanStatus,
      getMercadoPagoSubscriptionStatus
    );

    await expect(
      repository.delete({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted,
    });
    expect(getMercadoPagoPlanStatus).not.toHaveBeenCalled();
    expect(getMercadoPagoSubscriptionStatus).not.toHaveBeenCalled();
  });

  it("should delete canceled prices without checking historical provider subscribers", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...createSubscriptionPriceRow({
              mercado_pago_preapproval_plan_id: "plan-1",
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
              tribe_id: "tribe-1",
            }),
            access_token: "access-token",
            can_manage_prices: true,
            refresh_token: null,
            token_expires_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            was_deleted: true,
          },
        ],
      });
    const getMercadoPagoSubscriptionStatus: Mock = vi.fn(async () => null);
    const repository = createRepository(
      execute,
      vi.fn(),
      vi.fn(),
      vi.fn(async () => "canceled"),
      getMercadoPagoSubscriptionStatus
    );

    await expect(
      repository.delete({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted,
    });
    expect(getMercadoPagoSubscriptionStatus).not.toHaveBeenCalled();
  });
});
