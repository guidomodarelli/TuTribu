import { vi, describe, it, expect } from "vitest";
import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { PostgresTribePaymentIntegrationRepository } from "@/src/modules/subscriptions/infrastructure/repositories/postgres-tribe-payment-integration-repository";

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

describe("PostgresTribePaymentIntegrationRepository", () => {
  it("should reconnect an anonymous Mercado Pago account without creating duplicates", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (statement) => {
      const sqlText = getSqlText(statement);
      const handlesAnonymousAccountReconnect = sqlText.includes(
        "provider_account_id is null"
      );

      return {
        rows: [
          {
            status: handlesAnonymousAccountReconnect
              ? TRIBE_SUBSCRIPTION_PRICE_STATUS.connected
              : TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
          },
        ],
      };
    });
    const repository = new PostgresTribePaymentIntegrationRepository(
      async (callback) => callback({ execute } as never)
    );

    await expect(
      repository.connect({
        accessToken: "access-token",
        expiresIn: 3600,
        providerAccountId: null,
        refreshToken: "refresh-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.connected,
    });
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "provider_account_id is null"
    );
  });
});
