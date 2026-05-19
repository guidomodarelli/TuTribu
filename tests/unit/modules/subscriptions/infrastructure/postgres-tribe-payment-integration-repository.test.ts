import { PostgresTribePaymentIntegrationRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-payment-integration-repository";
import { createKyselyRequestDatabase } from "@/src/modules/shared/infrastructure/database/kysely-request-database";

function createRequestKyselyDatabaseDouble(
  rowBatches: Array<Array<Record<string, unknown>>>
) {
  const query = jest.fn(async () => {
    const rows = rowBatches.shift() ?? [];

    return {
      rowCount: rows.length,
      rows,
    };
  });

  return {
    database: {
      kysely: createKyselyRequestDatabase({
        query,
      } as never),
    },
    query,
  };
}

function getExecutedSqlText(databaseDouble: {
  query: jest.Mock;
}): string {
  return databaseDouble.query.mock.calls
    .map(([statement]) => String(statement))
    .join("\n");
}

describe("PostgresTribePaymentIntegrationRepository", () => {
  it("connects Mercado Pago integrations with tribe subscription management permissions", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ canManageSubscriptionPrices: true }],
      [{ id: "integration-1" }],
    ]);
    const repository = new PostgresTribePaymentIntegrationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.connect({
        accessToken: "access-token",
        expiresIn: 3600,
        providerAccountId: "account-1",
        refreshToken: "refresh-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "connected",
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("public.can_manage_tribe_subscription_prices");
    expect(sqlText).toContain('insert into "tribe_payment_integrations"');
    expect(sqlText).toContain('on conflict ("tribe_id", "provider") do update');
    expect(sqlText).toContain("public.current_app_user_id");
  });

  it("returns not found when the tribe does not exist", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([[]]);
    const repository = new PostgresTribePaymentIntegrationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.connect({
        accessToken: "access-token",
        expiresIn: null,
        providerAccountId: null,
        refreshToken: null,
        tribeSlug: "missing-tribe",
      })
    ).resolves.toEqual({
      status: "not_found",
    });

    expect(databaseDouble.query).toHaveBeenCalledTimes(1);
  });

  it("returns forbidden before upserting when the viewer cannot manage subscription prices", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ canManageSubscriptionPrices: false }],
    ]);
    const repository = new PostgresTribePaymentIntegrationRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.connect({
        accessToken: "access-token",
        expiresIn: null,
        providerAccountId: null,
        refreshToken: null,
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: "forbidden",
    });

    expect(getExecutedSqlText(databaseDouble)).not.toContain(
      'insert into "tribe_payment_integrations"'
    );
  });
});
