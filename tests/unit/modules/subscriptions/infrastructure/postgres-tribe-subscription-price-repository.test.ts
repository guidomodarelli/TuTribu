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
  execute: jest.Mock,
  createMercadoPagoPlan = jest.fn(async () => "plan-1"),
  refreshMercadoPagoAccessToken = jest.fn(async () => ({
    accessToken: "fresh-access-token",
    expiresIn: 3600,
    providerAccountId: "seller-1",
    refreshToken: "new-refresh-token",
  })),
  getMercadoPagoPlanStatus = jest.fn(async () => "active"),
  getMercadoPagoSubscriptionStatus = jest.fn(async () => "authorized"),
  updateMercadoPagoPlan = jest.fn(async () => ({
    amountCents: 500000,
    currency: "ARS",
    externalReference: "tutribu:price:price-1",
    id: "plan-1",
    reason: "Plan mensual",
    status: "active",
  })),
  getMercadoPagoPlan = jest.fn(async () => ({
    amountCents: 500000,
    currency: "ARS",
    externalReference: "tutribu:price:price-1",
    id: "plan-1",
    reason: "Plan mensual",
    status: "active",
  }))
) {
  return new PostgresTribeSubscriptionPriceRepository(
    async (callback) => callback({ execute } as never),
    createMercadoPagoPlan,
    updateMercadoPagoPlan,
    getMercadoPagoPlan,
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
    trial_frequency: 7,
    trial_frequency_type: "days",
    ...overrides,
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

  it("should list prices with connected Mercado Pago health when token refresh succeeds", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          ...createSubscriptionPriceRow(),
          access_token: "stored-access-token",
          can_manage_prices: true,
          can_view_prices: true,
          has_mercado_pago_integration: true,
          refresh_token: "stored-refresh-token",
          token_expires_at: "2026-05-06T13:05:00.000Z",
          tribe_id: "tribe-1",
        },
      ],
    }));
    const refreshMercadoPagoAccessToken = jest.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "seller-1",
      refreshToken: "new-refresh-token",
    }));
    const repository = createRepository(
      execute,
      jest.fn(async () => "plan-1"),
      refreshMercadoPagoAccessToken
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
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

    expect(getSqlText(execute.mock.calls[0]?.[0])).toMatch(
      /tribe_member_subscriptions\.status in \([\s\S]*paused/
    );
    expect(refreshMercadoPagoAccessToken).toHaveBeenCalledWith(
      "stored-refresh-token"
    );
  });

  it("should keep paused prices visible while preserving subscriber diagnostics", async () => {
    const execute = jest.fn(async () => ({
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
    }));
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

    const listSqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(listSqlText).toMatch(
      /tribe_subscription_prices\.status in \([\s\S]*'active'[\s\S]*'paused'[\s\S]*'canceled'[\s\S]*\)/
    );
  });

  it("should expose update trial policy for synchronized Mercado Pago prices", async () => {
    const execute = jest.fn(async () => ({
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
    }));
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
    expect(getSqlText(execute.mock.calls[0][0])).toContain(
      "mercado_pago_preapproval_plan_id"
    );
  });

  it("should list Mercado Pago health as requiring reconnection when token refresh fails", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          ...createSubscriptionPriceRow(),
          access_token: "stored-access-token",
          can_manage_prices: true,
          can_view_prices: true,
          has_mercado_pago_integration: true,
          refresh_token: "revoked-refresh-token",
          token_expires_at: "2026-05-06T13:05:00.000Z",
          tribe_id: "tribe-1",
        },
      ],
    }));
    const refreshMercadoPagoAccessToken = jest.fn(async () => {
      throw new Error("Mercado Pago rejected refresh token");
    });
    const repository = createRepository(
      execute,
      jest.fn(async () => "plan-1"),
      refreshMercadoPagoAccessToken
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
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
    const execute = jest.fn(async (statement) => {
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
            refresh_token: "revoked-refresh-token",
            token_expires_at: "2026-05-06T13:05:00.000Z",
            tribe_id: "tribe-1",
          },
        ],
      };
    });
    const refreshMercadoPagoAccessToken = jest.fn(async () => {
      throw new Error("Mercado Pago rejected rotated refresh token");
    });
    const repository = createRepository(
      execute,
      jest.fn(async () => "plan-1"),
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
    const execute = jest.fn(async () => ({
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
    }));
    const refreshMercadoPagoAccessToken = jest.fn();
    const repository = createRepository(
      execute,
      jest.fn(async () => "plan-1"),
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
    const execute = jest.fn(async (statement) => {
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
      const execute = jest.fn(async (statement) => {
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

      expect(executedSqlTexts[0]).toMatch(
        /target_tribe as \([\s\S]*for update/
      );
      expect(clearPreviousIndex).toBeGreaterThan(0);
      expect(setCurrentIndex).toBeGreaterThan(clearPreviousIndex);
      expect(clearFreeJoinIndex).toBeGreaterThan(setCurrentIndex);
    }
  );

  it("does not clear free-join mode for prices without provider plans", async () => {
    const executedSqlTexts: string[] = [];
    const execute = jest.fn(async (statement) => {
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

    expect(executedSqlTexts[0]).toContain(
      "tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null"
    );
    expect(
      executedSqlTexts.some((sqlText) =>
        sqlText.includes("set free_join_is_current = false")
      )
    ).toBe(false);
  });

  it(
    "marks the tribe as free-join current and clears any current paid price",
    async () => {
      const executedSqlTexts: string[] = [];
      const execute = jest.fn(async (statement) => {
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

      expect(executedSqlTexts[0]).toMatch(
        /target_tribe as \([\s\S]*for update/
      );
      expect(clearPaidPricesIndex).toBeGreaterThanOrEqual(0);
      expect(setFreeJoinIndex).toBeGreaterThan(clearPaidPricesIndex);
    }
  );

  it(
    "returns freeJoinIsCurrent from the list query",
    async () => {
      const execute = jest.fn(async () => ({
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
            status: "active",
            token_expires_at: null,
            trial_frequency: null,
            trial_frequency_type: null,
            tribe_id: "tribe-1",
          },
        ],
      }));
      const repository = createRepository(execute);

      await expect(
        repository.listByTribeSlug({ tribeSlug: "matematica-pro" })
      ).resolves.toMatchObject({
        freeJoinIsCurrent: true,
      });
    }
  );

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
      jest.fn(async () => ({
        amountCents: 500000,
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
        id: "plan-1",
        reason: "Plan mensual",
        status: "active",
      })),
      jest.fn(async () => ({
        amountCents: 500000,
        currency: "ARS",
        externalReference: "tutribu:price:price-1",
        id: "plan-1",
        reason: "Plan mensual",
        status: "active",
      })),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized")
    );

    await repository.create({
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

  it("should update the same provider plan and local price when the amount changes", async () => {
    const execute = jest
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
    const createMercadoPagoPlan = jest.fn();
    const updateMercadoPagoPlan = jest.fn(async () => ({
      amountCents: 600000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan actualizado",
      status: "active",
      trial: {
        frequency: 21,
        frequencyType: "days" as const,
      },
    }));
    const repository = createRepository(
      execute,
      createMercadoPagoPlan,
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
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
    const updateSqlText = getSqlText(execute.mock.calls[1][0]);

    expect(updateSqlText).toMatch(/amount_cents\s*=/);
    expect(updateSqlText).toMatch(/trial_frequency\s*=/);
    expect(updateSqlText).toMatch(
      /count\(tribe_member_subscriptions\.id\) filter/
    );
    expect(updateSqlText).not.toContain("0 as active_subscribers_count");
  });

  it("should update Mercado Pago and local storage when the trial period changes", async () => {
    const execute = jest
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
    const updateMercadoPagoPlan = jest.fn(async () => ({
      amountCents: 500000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "active",
      trial: {
        frequency: 14,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
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
    const updateSqlText = getSqlText(execute.mock.calls[1][0]);

    expect(updateSqlText).toContain("snapshotted_subscriptions as");
    expect(updateSqlText).toContain(
      "public.snapshot_tribe_member_subscriptions_before_price_change"
    );
    expect(updateSqlText).not.toContain("update public.tribe_member_subscriptions");
    expect(updateSqlText).toContain("trial_frequency");
    expect(updateSqlText).toContain("trial_frequency_type");
  });

  it("should reject paused price updates before mutating the provider plan", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
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
    const updateMercadoPagoPlan = jest.fn();
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
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
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("should preserve the stored trial period when update fields are omitted", async () => {
    const execute = jest
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
    const updateMercadoPagoPlan = jest.fn(async () => ({
      amountCents: 500000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual actualizado",
      status: "active",
      trial: {
        frequency: 7,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
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
    expect(getSqlText(execute.mock.calls[0][0])).toContain("trial_frequency");
    expect(getSqlText(execute.mock.calls[0][0])).toContain(
      "trial_frequency_type"
    );
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
        backUrl: "https://tutribu.example.com/matematica-pro",
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
        rows: [
          createSubscriptionPriceRow({
            free_join_is_current: true,
            is_current: false,
            status: "canceled",
          }),
        ],
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
      freeJoinIsCurrent: true,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: 1,
    });
  });

  it("should reactivate paused local prices when manual provider verification finds an active plan", async () => {
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
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active")
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

    const priceLookupSqlText = getSqlText(execute.mock.calls[1][0]);
    const activationSqlText = getSqlText(execute.mock.calls[2][0]);

    expect(priceLookupSqlText).toMatch(
      /tribe_subscription_prices\.status in \([\s\S]*'active'[\s\S]*'paused'[\s\S]*'canceled'[\s\S]*\)/
    );
    expect(activationSqlText).toContain(
      `status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.active}`
    );
    expect(activationSqlText).toContain(
      "tribe_subscription_prices.status = 'paused'"
    );
  });

  it("should cancel paused local prices when manual provider verification finds a canceled plan", async () => {
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
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "canceled")
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

    expect(getSqlText(execute.mock.calls[2][0])).toMatch(
      /tribe_subscription_prices\.status in \([\s\S]*'active'[\s\S]*'paused'[\s\S]*\)/
    );
  });

  it("should restore free-join mode when provider verification pauses the current paid price", async () => {
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
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "paused")
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

    const pauseSqlText = getSqlText(execute.mock.calls[2][0]);

    expect(pauseSqlText).toContain("set free_join_is_current = true");
    expect(pauseSqlText).toContain("target_price.is_current = true");
  });

  it("should restore free-join mode when provider verification cancels the current paid price", async () => {
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
      jest.fn(),
      jest.fn(),
      jest.fn(async () => null)
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

    const cancellationSqlText = getSqlText(execute.mock.calls[2][0]);

    expect(cancellationSqlText).toContain("set free_join_is_current = true");
    expect(cancellationSqlText).toContain("target_price.is_current = true");
    expect(cancellationSqlText).toContain(
      "tribe_subscription_prices.is_current = true"
    );
    expect(cancellationSqlText).toContain(
      "tribe_subscription_prices.id <> (select id from target_price)"
    );
  });

  it("should keep the Mercado Pago plan identifier when provider verification cancels a local price", async () => {
    const execute = jest.fn(async (statement) => {
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
            status: "canceled",
            trial_frequency: returnsTrial ? 1 : null,
            trial_frequency_type: returnsTrial ? "months" : null,
          }),
        ],
      };
    });
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => null)
    );

    await expect(
      repository.verifyProviderPlan({
        priceId: "price-1",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      price: {
        status: "canceled",
        trial: {
          frequency: 1,
          frequencyType: "months",
        },
      },
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
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

  it("should read trial fields when provider plan verification returns the local price", async () => {
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
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active")
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

    const verificationSqlText = getSqlText(execute.mock.calls[1][0]);

    expect(verificationSqlText).toContain("trial_frequency");
    expect(verificationSqlText).toContain("trial_frequency_type");
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

  it("should reconcile canceled local subscriber rows when Mercado Pago reports them as canceled", async () => {
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
    const getMercadoPagoSubscriptionStatus = jest.fn(async () => "cancelled");
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "canceled"),
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
    const reconciliationSqlText = getSqlText(execute.mock.calls[3][0]);

    expect(reconciliationSqlText).toMatch(
      /group by[\s\S]*target_price\.trial_frequency/
    );
    expect(reconciliationSqlText).toMatch(
      /group by[\s\S]*target_price\.trial_frequency_type/
    );
    expect(
      execute.mock.calls.some((call) =>
        getSqlText(call[0]).includes("update public.tribe_member_subscriptions")
      )
    ).toBe(true);
    expect(
      execute.mock.calls.some((call) =>
        getSqlText(call[0]).includes("update public.tribe_members")
      )
    ).toBe(true);
  });

  it("should keep authorized pending and paused provider subscriptions associated while only authorized grants access", async () => {
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
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            active_subscribers_count: 3,
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
        ],
      });
    const getMercadoPagoSubscriptionStatus = jest
      .fn()
      .mockResolvedValueOnce("authorized")
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("paused");
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
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

    const reconciliationSqlText = execute.mock.calls
      .map((call) => getSqlText(call[0]))
      .find((sqlText) => sqlText.includes("update public.tribe_members"));

    expect(reconciliationSqlText).toMatch(
      /tribe_member_subscriptions\.status = .*active/
    );
    expect(reconciliationSqlText).toMatch(
      /tribe_member_subscriptions\.status = .*pending/
    );
    expect(reconciliationSqlText).toMatch(/else 'removed'/);
  });

  it("should return provider subscriber count with the reconciled local association count", async () => {
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
      })
      .mockResolvedValueOnce({
        rows: [
          createSubscriptionPriceRow({
            active_subscribers_count: 2,
            mercado_pago_preapproval_plan_id: "plan-1",
          }),
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
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "canceled"),
      jest.fn(async () => "cancelled")
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

    const priceLookupSqlText = getSqlText(execute.mock.calls[1][0]);

    expect(priceLookupSqlText).toMatch(
      /tribe_subscription_prices\.status\s+in\s*\([^)]*active[^)]*canceled[^)]*\)/
    );
  });

  it("should restrict provider plan verification to live provider plan prices", async () => {
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
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            freeJoinIsCurrent: false,
            prices: [],
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const repository = createRepository(execute);

    await repository.verifyProviderPlans({ tribeSlug: "matematica-pro" });

    const priceLookupSqlText = getSqlText(execute.mock.calls[1][0]);

    expect(priceLookupSqlText).toMatch(
      /tribe_subscription_prices\.status in \([\s\S]*'active'[\s\S]*'paused'[\s\S]*\)/
    );
    expect(priceLookupSqlText).not.toMatch(/canceled/);
  });

  it("does not leave an idempotent lock when the provider plan call fails before registration", async () => {
    const execute = jest.fn(async (statement) => {
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
    const getMercadoPagoPlan = jest.fn(async () => {
      throw new Error("provider unavailable");
    });
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
      jest.fn(),
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
    expect(
      execute.mock.calls.some((call) =>
        getSqlText(call[0]).includes(
          "insert into public.subscription_idempotency_operations"
        )
      )
    ).toBe(false);
    expect(
      execute.mock.calls.some((call) =>
        getSqlText(call[0]).includes(
          "delete from public.subscription_idempotency_operations"
        )
      )
    ).toBe(false);
  });

  it("should restore free-join mode when a provider webhook cancels the current paid price", async () => {
    const executedSqlTexts: string[] = [];
    const execute = jest.fn(async (statement) => {
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
    const getMercadoPagoPlan = jest.fn(async () => ({
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "cancelled",
    }));
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
      jest.fn(),
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

    const cancellationSqlText = executedSqlTexts.find((sqlText) =>
      sqlText.includes("set free_join_is_current = true")
    );

    expect(cancellationSqlText).toContain("target_price.is_current = true");
    expect(cancellationSqlText).toContain(
      "tribe_subscription_prices.is_current = true"
    );
    expect(cancellationSqlText).toContain(
      "tribe_subscription_prices.id <> (select id from target_price)"
    );
  });

  it("should sync provider plan webhooks with the RLS-safe price context", async () => {
    const execute = jest.fn(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("update public.tribe_subscription_prices")) {
        return {
          rows: [
            createSubscriptionPriceRow({
              amount_cents: 700000,
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
    const getMercadoPagoPlan = jest.fn(async () => ({
      amountCents: 700000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan actualizado",
      status: "active",
      trial: {
        frequency: 21,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
      jest.fn(),
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
        name: "Plan actualizado",
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
    const executedSqlText = execute.mock.calls
      .map(([statement]) => getSqlText(statement))
      .join("\n");

    expect(executedSqlText).toContain("amount_cents =");
    expect(executedSqlText).toContain("snapshotted_subscriptions as");
    expect(executedSqlText).toContain(
      "public.snapshot_tribe_member_subscriptions_before_price_change"
    );
    expect(executedSqlText).toMatch(
      /count\(tribe_member_subscriptions\.id\) filter/
    );
  });

  it("should pause local prices when Mercado Pago pauses provider plans", async () => {
    const execute = jest.fn(async (statement) => {
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
    const getMercadoPagoPlan = jest.fn(async () => ({
      amountCents: 500000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "paused",
      trial: null,
    }));
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
      jest.fn(),
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
    const execute = jest.fn(async (statement) => {
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
    const getMercadoPagoPlan = jest.fn(async () => ({
      amountCents: 500000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "active",
      trial: {
        frequency: 7,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
      jest.fn(),
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

    const sqlTexts = execute.mock.calls.map((call) => getSqlText(call[0]));

    expect(sqlTexts.some((sqlText) => sqlText.includes("update public.tribe_subscription_prices"))).toBe(false);
    expect(sqlTexts.some((sqlText) => sqlText.includes("set status =") && sqlText.includes("is_current = false"))).toBe(false);
  });

  it("re-applies provider plan changes after oscillation when the local price diverges from the target", async () => {
    const execute = jest.fn(async (statement) => {
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
    const getMercadoPagoPlan = jest.fn(async () => ({
      amountCents: 500000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "active",
      trial: {
        frequency: 7,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
      jest.fn(),
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

    const sqlTexts = execute.mock.calls.map((call) => getSqlText(call[0]));

    expect(sqlTexts.some((sqlText) => sqlText.includes("update public.tribe_subscription_prices"))).toBe(true);
  });

  it("keys the provider plan webhook idempotency by plan and content hash", async () => {
    const insertedKeys: string[] = [];
    const execute = jest.fn(async (statement) => {
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
    const getMercadoPagoPlan = jest.fn(async () => ({
      amountCents: 800000,
      currency: "ARS",
      externalReference: "tutribu:price:price-1",
      id: "plan-1",
      reason: "Plan mensual",
      status: "active",
      trial: {
        frequency: 7,
        frequencyType: "days",
      },
    }));
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
      jest.fn(),
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
    const execute = jest.fn().mockResolvedValueOnce({
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

    const diagnosticsSqlText = getSqlText(execute.mock.calls[0][0]);

    expect(diagnosticsSqlText).toContain(
      "count(tribe_member_subscriptions.id) filter"
    );
    expect(diagnosticsSqlText).toContain(
      "public.can_manage_tribe_subscription_prices"
    );
    expect(diagnosticsSqlText).not.toContain("user_id");
    expect(diagnosticsSqlText).not.toContain(
      "tribe_member_subscriptions.price_id = tribe_subscription_prices.id"
    );
    expect(diagnosticsSqlText).toContain(
      "tribe_member_subscriptions.mercado_pago_preapproval_id is not null"
    );
    expect(diagnosticsSqlText).toContain(
      "tribe_member_subscriptions.mercado_pago_preapproval_id is null"
    );
  });

  it("should return null when aggregate diagnostics have no authorized target tribe", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
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
          {
            mercado_pago_preapproval_id: "subscription-1",
          },
          {
            mercado_pago_preapproval_id: "subscription-2",
          },
          {
            mercado_pago_preapproval_id: "subscription-3",
          },
          {
            mercado_pago_preapproval_id: "subscription-4",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
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
    const getMercadoPagoSubscriptionStatus = jest
      .fn()
      .mockResolvedValueOnce("authorized")
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("paused")
      .mockResolvedValueOnce(null);
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
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
    expect(getSqlText(execute.mock.calls[1][0])).toContain(
      "tribe_member_subscriptions.price_id is null"
    );
    expect(
      execute.mock.calls.some((call) =>
        getSqlText(call[0]).includes("update public.tribe_member_subscriptions")
      )
    ).toBe(true);
    expect(
      execute.mock.calls.some((call) =>
        getSqlText(call[0]).includes("update public.tribe_members")
      )
    ).toBe(true);
  });

  it("should keep linked invitations as the deletion blocker even when subscribers exist", async () => {
    const execute = jest.fn(async (statement) => {
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
    const updateMercadoPagoPlan = jest.fn();
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "active"),
      jest.fn(async () => "authorized"),
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
    expect(
      execute.mock.calls.some((call) =>
        getSqlText(call[0]).includes("has_local_active_subscriptions")
      )
    ).toBe(false);
  });

  it("should delete canceled local prices when the provider plan link is already missing", async () => {
    const execute = jest
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
    const getMercadoPagoPlanStatus = jest.fn();
    const getMercadoPagoSubscriptionStatus = jest.fn();
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
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
    const execute = jest
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
    const getMercadoPagoPlanStatus = jest.fn(async () => "paused");
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      getMercadoPagoPlanStatus,
      jest.fn()
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
    expect(execute).toHaveBeenCalledTimes(2);
    expect(
      execute.mock.calls
        .map(([statement]) => getSqlText(statement))
        .join("\n")
    ).not.toContain("detach_tribe_member_subscriptions_from_deleted_price");
  });

  it("should revalidate invitation reassignment targets inside delete transactions", async () => {
    const execute = jest
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
      jest.fn(),
      jest.fn(),
      jest.fn(),
      jest.fn()
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

    const executedSql = execute.mock.calls
      .map(([statement]) => getSqlText(statement))
      .join("\n");

    expect(executedSql).not.toMatch(
      /set subscription_association_type = 'specific'/
    );
    expect(executedSql).not.toMatch(
      /update public\.tribe_subscription_prices[\s\S]*status = .*deleted/
    );
  });

  it("should block deleting paused provider plans before applying invitation actions", async () => {
    const execute = jest
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
    const getMercadoPagoPlanStatus = jest.fn(async () => "paused");
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      getMercadoPagoPlanStatus,
      jest.fn()
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
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("should detach member subscriptions when deleting canceled prices with invitation actions", async () => {
    const execute = jest
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
      jest.fn(),
      jest.fn(),
      jest.fn(),
      jest.fn()
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

    const executedSql = execute.mock.calls
      .map(([statement]) => getSqlText(statement))
      .join("\n");

    expect(executedSql).toContain(
      "public.detach_tribe_member_subscriptions_from_deleted_price"
    );
    expect(executedSql).not.toContain("update public.tribe_member_subscriptions");
    expect(executedSql).toContain("target_subscriptions as");
    expect(executedSql).toContain("select count(*) from target_subscriptions");
  });

  it("should delete missing provider-plan prices even when historical provider subscribers are still attached", async () => {
    const execute = jest
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
    const getMercadoPagoPlanStatus = jest.fn();
    const getMercadoPagoSubscriptionStatus = jest.fn(async () => "authorized");
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
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
    const execute = jest
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
    const getMercadoPagoSubscriptionStatus = jest.fn(async () => null);
    const repository = createRepository(
      execute,
      jest.fn(),
      jest.fn(),
      jest.fn(async () => "canceled"),
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
