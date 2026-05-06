import {
  getMercadoPagoPreapprovalStatus,
  refreshMercadoPagoAccessToken,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";

describe("mercado pago subscription gateway", () => {
  const fetchMock = jest.fn();
  const previousFetch = global.fetch;
  const previousClientId = process.env.MERCADO_PAGO_CLIENT_ID;
  const previousClientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MERCADO_PAGO_CLIENT_ID = "client-id";
    process.env.MERCADO_PAGO_CLIENT_SECRET = "client-secret";
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = previousFetch;

    if (previousClientId === undefined) {
      delete process.env.MERCADO_PAGO_CLIENT_ID;
    } else {
      process.env.MERCADO_PAGO_CLIENT_ID = previousClientId;
    }

    if (previousClientSecret === undefined) {
      delete process.env.MERCADO_PAGO_CLIENT_SECRET;
    } else {
      process.env.MERCADO_PAGO_CLIENT_SECRET = previousClientSecret;
    }
  });

  it("reads the provider preapproval status from Mercado Pago", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        status: "authorized",
      }),
      ok: true,
    });

    await expect(
      getMercadoPagoPreapprovalStatus({
        accessToken: "access-token",
        preapprovalId: "preapproval-1",
      })
    ).resolves.toBe("authorized");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/preapproval/preapproval-1",
      {
        headers: {
          Authorization: "Bearer access-token",
        },
        method: "GET",
      }
    );
  });

  it("rejects provider responses without a preapproval status", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({}),
      ok: true,
    });

    await expect(
      getMercadoPagoPreapprovalStatus({
        accessToken: "access-token",
        preapprovalId: "preapproval-1",
      })
    ).rejects.toThrow("Mercado Pago preapproval response did not include status");
  });

  it("refreshes Mercado Pago OAuth tokens with the stored refresh token", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        access_token: "fresh-access-token",
        expires_in: 3600,
        refresh_token: "new-refresh-token",
        user_id: 123,
      }),
      ok: true,
    });

    await expect(
      refreshMercadoPagoAccessToken("stored-refresh-token")
    ).resolves.toEqual({
      accessToken: "fresh-access-token",
      expiresIn: 3600,
      providerAccountId: "123",
      refreshToken: "new-refresh-token",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/oauth/token",
      expect.objectContaining({
        body: JSON.stringify({
          client_id: "client-id",
          client_secret: "client-secret",
          grant_type: "refresh_token",
          refresh_token: "stored-refresh-token",
        }),
        method: "POST",
      })
    );
  });
});
