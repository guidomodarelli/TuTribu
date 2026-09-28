import { vi, describe, it, expect } from "vitest";
import { refreshStoredMercadoPagoAccessToken } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-access-token";

describe("Mercado Pago access token refresh", () => {
  it("should not refresh or persist a token without a payment integration id", async () => {
    const executeWithDatabase = vi.fn();
    const refreshMercadoPagoAccessToken = vi.fn();

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
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({ rows: [] }); });
    const executeWithDatabase = vi.fn(async (callback) =>
      callback({ execute } as never)
    );
    const refreshMercadoPagoAccessToken = vi.fn(async () => ({
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
  });
});
