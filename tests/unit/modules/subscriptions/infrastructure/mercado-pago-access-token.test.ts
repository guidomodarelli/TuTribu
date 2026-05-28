import { refreshStoredMercadoPagoAccessToken } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-access-token";

function getSqlText(statement: unknown): string {
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

describe("Mercado Pago access token refresh", () => {
  it("should not refresh or persist a token without a payment integration id", async () => {
    const executeWithDatabase = jest.fn();
    const refreshMercadoPagoAccessToken = jest.fn();

    await expect(
      refreshStoredMercadoPagoAccessToken({
        executeWithDatabase,
        refreshMercadoPagoAccessToken,
        storedToken: {
          accessToken: "expired-access-token",
          paymentIntegrationId: null,
          refreshToken: "refresh-token",
          tokenExpiresAt: "2026-05-06T13:05:00.000Z",
          tribeId: "tribe-1",
        },
      })
    ).resolves.toBeNull();

    expect(refreshMercadoPagoAccessToken).not.toHaveBeenCalled();
    expect(executeWithDatabase).not.toHaveBeenCalled();
  });

  it("should persist refreshed tokens only for the selected payment integration", async () => {
    const execute = jest.fn(async () => ({ rows: [] }));
    const executeWithDatabase = jest.fn(async (callback) =>
      callback({ execute } as never)
    );
    const refreshMercadoPagoAccessToken = jest.fn(async () => ({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "seller-1",
      refreshToken: "new-refresh-token",
    }));

    await expect(
      refreshStoredMercadoPagoAccessToken({
        executeWithDatabase,
        refreshMercadoPagoAccessToken,
        storedToken: {
          accessToken: "expired-access-token",
          paymentIntegrationId: "integration-1",
          refreshToken: "refresh-token",
          tokenExpiresAt: "2026-05-06T13:05:00.000Z",
          tribeId: "tribe-1",
        },
      })
    ).resolves.toBe("fresh-access-token");

    const refreshSqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(refreshSqlText).toMatch(/where tribe_id =/);
    expect(refreshSqlText).toMatch(/and id =/);
    expect(refreshSqlText).not.toMatch(/::uuid is null/);
  });
});
