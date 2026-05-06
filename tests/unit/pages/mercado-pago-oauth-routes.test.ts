import { GET as CALLBACK_GET } from "@/app/api/mercado-pago/oauth/callback/route";
import { GET as START_GET } from "@/app/api/tribes/[slug]/mercado-pago/oauth/start/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();
const getMemberTribes = jest.fn();
const connectTribePaymentIntegration = jest.fn();
const redirectMock = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const fetchMock = jest.fn();

jest.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

function buildStartContext() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

function resolveRedirectUrl(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  return error.message.replace("NEXT_REDIRECT:", "");
}

describe("Mercado Pago OAuth routes", () => {
  const previousClientId = process.env.MERCADO_PAGO_CLIENT_ID;
  const previousClientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET;
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
  const authenticatedLeader = {
    avatarFallback: "GH",
    email: "leader@example.com",
    id: "leader-1",
    image: null,
    name: "Grace Hopper",
    role: "tribemate",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BETTER_AUTH_URL = "https://tutribu.example.com";
    process.env.MERCADO_PAGO_CLIENT_ID = "client-id";
    process.env.MERCADO_PAGO_CLIENT_SECRET = "client-secret";
    global.fetch = fetchMock as unknown as typeof fetch;
    getAuthenticatedMember.mockResolvedValue(authenticatedLeader);
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      subscriptions: {
        useCases: {
          connectTribePaymentIntegration,
        },
      },
      tribes: {
        useCases: {
          getMemberTribes,
        },
      },
    });
  });

  afterEach(() => {
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

    if (previousBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
    }
  });

  it("rejects OAuth callbacks when the signed state belongs to another member", async () => {
    const startRedirect = await START_GET(
      {
        headers: new Headers(),
        url: "https://tutribu.example.com/api/tribes/matematica-pro/mercado-pago/oauth/start",
      } as unknown as Request,
      buildStartContext()
    ).catch(resolveRedirectUrl);
    const state = new URL(startRedirect).searchParams.get("state");

    getAuthenticatedMember.mockResolvedValue({
      ...authenticatedLeader,
      id: "other-leader",
    });

    const callbackRedirect = await CALLBACK_GET(
      {
        headers: new Headers(),
        url: `https://tutribu.example.com/api/mercado-pago/oauth/callback?code=provider-code&state=${state}`,
      } as unknown as Request
    ).catch(resolveRedirectUrl);

    expect(callbackRedirect).toBe("/");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connectTribePaymentIntegration).not.toHaveBeenCalled();
  });

  it("redirects OAuth token exchange failures to a safe setup status", async () => {
    const startRedirect = await START_GET(
      {
        headers: new Headers(),
        url: "https://tutribu.example.com/api/tribes/matematica-pro/mercado-pago/oauth/start",
      } as unknown as Request,
      buildStartContext()
    ).catch(resolveRedirectUrl);
    const state = new URL(startRedirect).searchParams.get("state");

    fetchMock.mockResolvedValue({
      json: async () => ({
        message: "invalid_grant",
      }),
      ok: false,
      status: 400,
    });

    const callbackRedirect = await CALLBACK_GET(
      {
        headers: new Headers(),
        url: `https://tutribu.example.com/api/mercado-pago/oauth/callback?code=expired-code&state=${state}`,
      } as unknown as Request
    ).catch(resolveRedirectUrl);

    expect(callbackRedirect).toBe(
      "/tribu/matematica-pro/precios?status=setup_required"
    );
    expect(connectTribePaymentIntegration).not.toHaveBeenCalled();
  });
});
