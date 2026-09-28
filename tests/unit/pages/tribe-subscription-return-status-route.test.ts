import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { headers } from "next/headers";

import { GET } from "@/app/api/tribes/[slug]/subscriptions/return-status/route";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = vi.fn();
const getTribePageAccess = vi.fn();
const reconcileCurrentTribeMemberSubscription = vi.fn();
const resolveTribeMemberSubscriptionReturn = vi.fn();
const validatePendingTribeMemberSubscriptionReturn = vi.fn();
const infoMock = vi.fn();
const warnMock = vi.fn();
const errorMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(),
  })
);

const TRIBE_SLUG = "matematica-pro";
const PREAPPROVAL_ID = "2c9380848f1b4c3e";
const AUTHENTICATED_MEMBER = {
  avatarFallback: "BU",
  email: "blocked@example.com",
  id: "member-1",
  image: null,
  name: "Blocked User",
  role: "tribemate",
};
const PAYMENT_BLOCKED_ACCESS = {
  blockedReason: "payment_blocked",
  reason: "blocked_hidden",
  status: "hidden",
} as const;

function buildRequest(query: string): Request {
  return new Request(
    `https://tutribu.example.com/api/tribes/${TRIBE_SLUG}/subscriptions/return-status${query}`
  );
}

function buildContext(slug = TRIBE_SLUG) {
  return { params: Promise.resolve({ slug }) };
}

async function requestReturnStatus(
  query = `?preapproval_id=${PREAPPROVAL_ID}`,
  slug = TRIBE_SLUG
) {
  const response = await GET(buildRequest(query), buildContext(slug));

  return { body: await response.json(), response };
}

describe("GET /api/tribes/[slug]/subscriptions/return-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue(AUTHENTICATED_MEMBER);
    getTribePageAccess.mockResolvedValue(PAYMENT_BLOCKED_ACCESS);
    reconcileCurrentTribeMemberSubscription.mockResolvedValue({
      status: "pending",
    });
    resolveTribeMemberSubscriptionReturn.mockResolvedValue({
      status: "pending",
    });
    (createRequestModules as Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      subscriptions: {
        useCases: {
          reconcileCurrentTribeMemberSubscription,
          resolveTribeMemberSubscriptionReturn,
          validatePendingTribeMemberSubscriptionReturn,
        },
      },
      tribes: { useCases: { getTribePageAccess } },
    });
    (headers as Mock).mockResolvedValue(new Headers());
    (createServerLogger as Mock).mockReturnValue({
      error: errorMock,
      info: infoMock,
      warn: warnMock,
    });
  });

  it("keeps polling while the Mercado Pago confirmation is pending", async () => {
    const { body, response } = await requestReturnStatus();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body).toEqual({ status: "pending" });
    expect(resolveTribeMemberSubscriptionReturn).toHaveBeenCalledWith({
      providerSubscriptionId: PREAPPROVAL_ID,
      tribeSlug: TRIBE_SLUG,
    });
    expect(createRequestModules).toHaveBeenCalledWith(
      expect.objectContaining({ mercadoPagoWebhookVerified: true })
    );
  });

  it("keeps polling when Mercado Pago is temporarily unavailable", async () => {
    resolveTribeMemberSubscriptionReturn.mockResolvedValue({
      status: "provider_unavailable",
    });

    const { body, response } = await requestReturnStatus();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "pending" });
  });

  it("points an activated subscription to the tribe welcome page", async () => {
    resolveTribeMemberSubscriptionReturn.mockResolvedValue({ status: "active" });

    const { body } = await requestReturnStatus();

    expect(body).toEqual({
      redirectPath: "/matematica-pro/bienvenida",
      status: "resolved",
    });
  });

  it("points a paused subscription to the subscription status page", async () => {
    resolveTribeMemberSubscriptionReturn.mockResolvedValue({ status: "paused" });

    const { body } = await requestReturnStatus();

    expect(body).toEqual({
      redirectPath: "/matematica-pro/suscripcion",
      status: "resolved",
    });
  });

  it("points to the welcome page once the reconciled access is visible", async () => {
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: TRIBE_SLUG,
        visibility: "private",
      },
    });

    const { body } = await requestReturnStatus();

    expect(body).toEqual({
      redirectPath: "/matematica-pro/bienvenida",
      status: "resolved",
    });
    expect(resolveTribeMemberSubscriptionReturn).not.toHaveBeenCalled();
  });

  it("hands an unresolvable return back to the tribe page instead of polling forever", async () => {
    resolveTribeMemberSubscriptionReturn.mockResolvedValue({
      status: "not_found",
    });

    const { body } = await requestReturnStatus();

    expect(body).toEqual({
      redirectPath: `/matematica-pro?preapproval_id=${PREAPPROVAL_ID}`,
      status: "resolved",
    });
  });

  it("never resolves the return for a conduct-blocked member", async () => {
    getTribePageAccess.mockResolvedValue({
      ...PAYMENT_BLOCKED_ACCESS,
      blockedReason: "conduct_blocked",
    });

    const { body } = await requestReturnStatus();

    expect(body).toEqual({
      redirectPath: `/matematica-pro?preapproval_id=${PREAPPROVAL_ID}`,
      status: "resolved",
    });
    expect(resolveTribeMemberSubscriptionReturn).not.toHaveBeenCalled();
  });

  it("rejects visitors without a session", async () => {
    getAuthenticatedMember.mockResolvedValue(null);
    getTribePageAccess.mockResolvedValue({
      reason: "unauthenticated_hidden",
      status: "hidden",
    });

    const { body, response } = await requestReturnStatus();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      message: "Iniciá sesión para confirmar tu suscripción.",
    });
    expect(resolveTribeMemberSubscriptionReturn).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing preapproval id", ""],
    ["an empty preapproval id", "?preapproval_id="],
    ["a preapproval id with unsafe characters", "?preapproval_id=abc%2F..%2Fx"],
    ["an oversized preapproval id", `?preapproval_id=${"a".repeat(129)}`],
  ])("rejects %s before touching the session", async (_label, query) => {
    const { body, response } = await requestReturnStatus(query);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      message: "No pudimos verificar el regreso desde Mercado Pago.",
    });
    expect(createRequestModules).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ part: "query" }),
      })
    );
  });

  it("rejects an invalid tribe slug", async () => {
    const { response } = await requestReturnStatus(
      `?preapproval_id=${PREAPPROVAL_ID}`,
      " "
    );

    expect(response.status).toBe(400);
    expect(createRequestModules).not.toHaveBeenCalled();
  });

  it("answers a safe retryable error when the return cannot be resolved", async () => {
    resolveTribeMemberSubscriptionReturn.mockRejectedValue(
      new Error(`pool timeout for ${PREAPPROVAL_ID}`)
    );

    const { body, response } = await requestReturnStatus();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      message:
        "No pudimos confirmar tu suscripción en este momento. Seguimos intentando.",
    });
    expect(JSON.stringify(body)).not.toContain(PREAPPROVAL_ID);
    expect(errorMock).toHaveBeenCalledTimes(1);

    const loggedEntry = errorMock.mock.calls[0][0];

    expect(loggedEntry.metadata).toEqual(
      expect.objectContaining({
        operation_key: "subscription-return-status:matematica-pro",
        tribeSlug: TRIBE_SLUG,
        viewerId: AUTHENTICATED_MEMBER.id,
      })
    );
    expect(JSON.stringify(loggedEntry.metadata)).not.toContain(PREAPPROVAL_ID);
  });

  it("answers a safe server error when the tribe access cannot be resolved", async () => {
    getTribePageAccess.mockRejectedValue(new Error("database unavailable"));

    const { body, response } = await requestReturnStatus();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      message:
        "No pudimos confirmar tu suscripción en este momento. Seguimos intentando.",
    });
    expect(resolveTribeMemberSubscriptionReturn).not.toHaveBeenCalled();
  });
});
