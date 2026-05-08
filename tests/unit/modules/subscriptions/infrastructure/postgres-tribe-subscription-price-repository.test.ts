import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
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
  execute: jest.Mock,
  createMercadoPagoPlan = jest.fn(async () => "plan-1"),
  refreshMercadoPagoAccessToken = jest.fn(),
  getMercadoPagoPlanStatus = jest.fn(async () => "active"),
  getMercadoPagoSubscriptionStatus = jest.fn(async () => "authorized")
) {
  return new PostgresTribeSubscriptionPriceRepository(
    async (callback) => callback({ execute } as never),
    createMercadoPagoPlan,
    refreshMercadoPagoAccessToken,
    getMercadoPagoPlanStatus,
    getMercadoPagoSubscriptionStatus
  );
}

function createSubscriptionPriceRow(overrides: Record<string, unknown> = {}) {
  return {
    active_subscribers_count: 0,
    amount_cents: 500000,
    created_at: "2026-05-06T13:00:00.000Z",
    currency: "ARS",
    frequency: "monthly",
    id: "price-1",
    is_current: true,
    name: "Plan mensual",
    status: "active",
    status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
    ...overrides,
  };
}

describe("PostgresTribeSubscriptionPriceRepository", () => {
  it("lists prices with Mercado Pago integration availability", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          ...createSubscriptionPriceRow(),
          can_manage_prices: true,
          can_view_prices: true,
          has_mercado_pago_integration: true,
        },
      ],
    }));
    const repository = createRepository(execute);

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      hasMercadoPagoIntegration: true,
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
  });

  it("lists expired Mercado Pago integration without refresh token as disconnected", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          ...createSubscriptionPriceRow(),
          can_manage_prices: true,
          can_view_prices: true,
          has_mercado_pago_integration: false,
        },
      ],
    }));
    const repository = createRepository(execute);

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      hasMercadoPagoIntegration: false,
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
  });

  it("clears the previous current price before marking another price as current", async () => {
    const execute = jest.fn(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("set is_current = tribe_subscription_prices.id =")) {
        throw new Error("unique current price violation");
      }

      if (sqlText.includes("set is_current = false")) {
        return { rows: [] };
      }

      if (sqlText.includes("set is_current = true")) {
        return {
          rows: [createSubscriptionPriceRow()],
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
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.current,
    });
  });

  it("does not create a provider plan when reservation hits the price limit", async () => {
    const execute = jest.fn(async (statement) => {
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
    const createMercadoPagoPlan = jest.fn(async () => "plan-1");
    const repository = createRepository(execute, createMercadoPagoPlan);

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

  it("creates the Mercado Pago plan after the local price reservation finishes", async () => {
    const transactionEvents: string[] = [];
    const executeWithDatabase = jest.fn(async (callback) => {
      transactionEvents.push("transaction:start");

      const result = await callback({
        execute: jest.fn(async (statement) => {
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
    const createMercadoPagoPlan = jest.fn(async () => {
      transactionEvents.push("provider:create-plan");

      return "plan-1";
    });
    const repository = new PostgresTribeSubscriptionPriceRepository(
      executeWithDatabase,
      createMercadoPagoPlan,
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized")
    );

    await repository.create({
      amountCents: 500000,
      currency: "ARS",
      frequency: "monthly",
      name: "Plan mensual",
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
  });

  it("refreshes expired Mercado Pago tokens before creating provider plans", async () => {
    const expiredTokenDate = new Date(Date.now() - 60_000).toISOString();
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            access_token: "expired-access-token",
            can_manage_prices: true,
            existing_price_count: 0,
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
    const createMercadoPagoPlan = jest.fn(async () => "plan-1");
    const refreshMercadoPagoAccessToken = jest.fn(async () => ({
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
      })
    );
    expect(getSqlText(execute.mock.calls[1]?.[0])).toMatch(
      /update public\.tribe_payment_integrations/
    );
    expect(getSqlText(execute.mock.calls[1]?.[0])).toMatch(
      /set_config\([\s\S]*app\.subscription_checkout_tribe_id/
    );
  });

  it("should keep active prices when the provider plan still exists", async () => {
    const execute = jest
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
    const getMercadoPagoPlanStatus = jest.fn(async () => "active");
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      getMercadoPagoPlanStatus
    );

    await expect(
      repository.verifyProviderPlans({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
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
    const execute = jest
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
              status: "canceled",
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });
    const getMercadoPagoPlanStatus = jest.fn(async () => null);
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      getMercadoPagoPlanStatus
    );

    await expect(
      repository.verifyProviderPlans({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      canceledPriceIds: ["price-1"],
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    });
  });

  it("should not query Mercado Pago when no active local provider plan exists", async () => {
    const execute = jest
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
    const getMercadoPagoPlanStatus = jest.fn(async () => "active");
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
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
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("should not call Mercado Pago when the viewer cannot manage prices", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          access_token: "access-token",
          can_manage_prices: false,
          tribe_id: "tribe-1",
        },
      ],
    }));
    const getMercadoPagoPlanStatus = jest.fn(async () => "active");
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
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

  it("should return provider subscriber count without changing the local association count", async () => {
    const execute = jest
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
      });
    const getMercadoPagoSubscriptionStatus = jest
      .fn()
      .mockResolvedValueOnce("authorized")
      .mockResolvedValueOnce("paused")
      .mockResolvedValueOnce("canceled");
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      getMercadoPagoSubscriptionStatus
    );

    await expect(
      repository.verifyProviderSubscribers({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        activeSubscribersCount: 0,
      },
      providerActiveSubscribersCount: 2,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 3,
    });
    expect(getMercadoPagoSubscriptionStatus).toHaveBeenCalledTimes(3);
  });
});
