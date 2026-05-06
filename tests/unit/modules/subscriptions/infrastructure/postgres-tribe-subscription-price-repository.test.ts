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
  createMercadoPagoPlan = jest.fn(async () => "plan-1")
) {
  return new PostgresTribeSubscriptionPriceRepository(
    async (callback) => callback({ execute } as never),
    createMercadoPagoPlan
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

  it("revalidates the active price limit inside the insert transaction", async () => {
    const execute = jest.fn(async (statement) => {
      const sqlText = getSqlText(statement);

      if (sqlText.includes("active_prices_before_insert")) {
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

    expect(createMercadoPagoPlan).toHaveBeenCalledTimes(1);
  });

  it("creates the Mercado Pago plan after the validation transaction finishes", async () => {
    const transactionEvents: string[] = [];
    const executeWithDatabase = jest.fn(async (callback) => {
      transactionEvents.push("transaction:start");

      const result = await callback({
        execute: jest.fn().mockResolvedValue({
          rows: [
            {
              access_token: "access-token",
              can_manage_prices: true,
              existing_price_count: 0,
              tribe_id: "tribe-1",
            },
          ],
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
      createMercadoPagoPlan
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
      "provider:create-plan",
    ]);
  });
});
