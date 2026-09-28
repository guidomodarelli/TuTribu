/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { GET as getAccess } from "@/app/api/tribes/[slug]/academy/access/route";
import { POST as postBonus } from "@/app/api/tribes/[slug]/academy/bonuses/route";
import { POST as postCheckout } from "@/app/api/tribes/[slug]/academy/checkout/route";
import { POST as postJoin } from "@/app/api/tribes/[slug]/academy/join/route";
import { PATCH as patchVerification } from "@/app/api/tribes/[slug]/verifications/[verificationId]/route";
import { createRequestModules } from "@/src/modules/setup";

vi.mock("@/src/modules/setup", () => ({ createRequestModules: vi.fn() }));

const VERIFICATION_ID = "3f2b8c1d-4e5a-4b6c-8d7e-9f0a1b2c3d4e";
const GRANT_ID = "8a7b6c5d-4e3f-4a1b-9c8d-7e6f5a4b3c2d";
const IDEMPOTENCY_KEY = "7f5c9a0e-8d1b-4c3e-9a2f-1b2c3d4e5f60";

const useCases = {
  getAuthenticatedMember: vi.fn(),
  getOwnAcademyAccess: vi.fn(),
  grantAcademyBonus: vi.fn(),
  joinTribeAcademyAdmission: vi.fn(),
  reviewMemberVerification: vi.fn(),
  startAcademySubscription: vi.fn(),
};

function buildRequest(body?: unknown, url = "https://tutribu.example/api/tribes/matematica-pro/academy") {
  return new Request(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-request-id": "request-1" },
    method: body === undefined ? "GET" : "POST",
  });
}

function slugContext() {
  return { params: Promise.resolve({ slug: "matematica-pro" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  useCases.getAuthenticatedMember.mockResolvedValue({ id: "member-1" });
  (createRequestModules as Mock).mockResolvedValue({
    auth: { useCases: { getAuthenticatedMember: useCases.getAuthenticatedMember } },
    memberVerifications: {
      useCases: { reviewMemberVerification: useCases.reviewMemberVerification },
    },
    productAccess: {
      useCases: {
        getOwnAcademyAccess: useCases.getOwnAcademyAccess,
        grantAcademyBonus: useCases.grantAcademyBonus,
      },
    },
    subscriptions: { useCases: { startAcademySubscription: useCases.startAcademySubscription } },
    tribes: { useCases: { joinTribeAcademyAdmission: useCases.joinTribeAcademyAdmission } },
  });
});

describe("GET /academy/access", () => {
  it("answers 401 without a session", async () => {
    useCases.getAuthenticatedMember.mockResolvedValue(null);

    const response = await getAccess(buildRequest(), slugContext());

    expect(response.status).toBe(401);
    expect(useCases.getOwnAcademyAccess).not.toHaveBeenCalled();
  });

  it("returns the private, validated status DTO", async () => {
    useCases.getOwnAcademyAccess.mockResolvedValue({
      access: {
        accessEndsAt: new Date("2026-07-01T00:00:00.000Z"),
        canStartCheckout: false,
        eligibility: "verified",
        firstActivatedAt: new Date("2026-06-01T00:00:00.000Z"),
        hasBonusCoverage: true,
        hasPaidCoverage: false,
        isLeaderPreview: false,
        level: "academy",
        nextAction: "continue_learning",
        renewalStatus: "none",
      },
      accessModel: "academy",
      status: "ok",
    });

    const response = await getAccess(buildRequest(), slugContext());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      accessEndsAt: "2026-07-01T00:00:00.000Z",
      accessModel: "academy",
      canStartCheckout: false,
      eligibility: "verified",
      firstActivatedAt: "2026-06-01T00:00:00.000Z",
      hasBonusCoverage: true,
      hasPaidCoverage: false,
      isLeaderPreview: false,
      level: "academy",
      nextAction: "continue_learning",
      renewalStatus: "none",
    });
  });
});

describe("POST /academy/join", () => {
  it.each([
    ["joined", 201],
    ["already_member", 200],
    ["admission_closed", 403],
    ["blocked", 403],
  ])("maps %s to %i", async (status, httpStatus) => {
    useCases.joinTribeAcademyAdmission.mockResolvedValue({ status });

    const response = await postJoin(buildRequest({}), slugContext());

    expect(response.status).toBe(httpStatus);
  });
});

describe("POST /academy/bonuses", () => {
  const body = {
    endsAt: "2026-07-15T12:00:00.000Z",
    idempotencyKey: IDEMPOTENCY_KEY,
    reason: "Alumna destacada",
    recipientUserId: "member-2",
  };

  it("rejects an invalid body at the boundary", async () => {
    const response = await postBonus(buildRequest({ ...body, idempotencyKey: "x" }), slugContext());

    expect(response.status).toBe(400);
    expect(useCases.grantAcademyBonus).not.toHaveBeenCalled();
  });

  it("asks for the explicit exception when the recipient is not verified", async () => {
    useCases.grantAcademyBonus.mockResolvedValue({ status: "recipient_not_verified" });

    const response = await postBonus(buildRequest(body), slugContext());

    expect(response.status).toBe(422);
    expect(useCases.grantAcademyBonus).toHaveBeenCalledWith(
      expect.objectContaining({ allowUnverifiedRecipient: false, replacesGrantId: null })
    );
  });

  it("warns about an active renewal when the bonus is created", async () => {
    useCases.grantAcademyBonus.mockResolvedValue({
      grant: {
        endsAt: new Date("2026-07-15T12:00:00.000Z"),
        id: GRANT_ID,
        revokedAt: null,
        sourceType: "manual_bonus",
        startsAt: new Date("2026-06-15T12:00:00.000Z"),
      },
      hasActiveRenewal: true,
      status: "created",
    });

    const response = await postBonus(buildRequest(body), slugContext());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      grant: { id: GRANT_ID, sourceType: "manual_bonus" },
      hasActiveRenewal: true,
      status: "created",
    });
  });
});

describe("POST /academy/checkout", () => {
  it("returns only the provider checkout URL", async () => {
    useCases.startAcademySubscription.mockResolvedValue({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=x",
      status: "redirect",
    });

    const response = await postCheckout(buildRequest({ acceptedOfferVersion: 2 }), slugContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checkoutUrl: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=x",
    });
  });

  it("answers 503 with a safe message when the provider is unavailable", async () => {
    useCases.startAcademySubscription.mockResolvedValue({ status: "provider_unavailable" });

    const response = await postCheckout(buildRequest({ acceptedOfferVersion: 2 }), slugContext());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.message).toContain("no se generó un cobro nuevo");
  });

  it("answers 409 when the offer changed", async () => {
    useCases.startAcademySubscription.mockResolvedValue({ status: "offer_changed" });

    const response = await postCheckout(buildRequest({ acceptedOfferVersion: 1 }), slugContext());

    expect(response.status).toBe(409);
  });
});

describe("PATCH /verifications/[verificationId]", () => {
  it("returns 409 with the current state when another reviewer decided first (AC-05)", async () => {
    useCases.reviewMemberVerification.mockResolvedValue({
      status: "conflict",
      verification: {
        declaredEmail: null,
        decisionReason: null,
        id: VERIFICATION_ID,
        memberDisplayName: "Ana",
        memberUserId: "member-2",
        providerDisplayName: "Broker A",
        providerId: VERIFICATION_ID,
        reviewedAt: new Date("2026-06-15T12:00:00.000Z"),
        status: "verified",
        updatedAt: new Date("2026-06-15T12:00:00.000Z"),
        version: 3,
      },
    });

    const response = await patchVerification(
      new Request(`https://tutribu.example/api/tribes/matematica-pro/verifications/${VERIFICATION_ID}`, {
        body: JSON.stringify({ decision: "rejected", expectedVersion: 2, reason: "No coincide" }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ slug: "matematica-pro", verificationId: VERIFICATION_ID }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ status: "verified", version: 3 });
  });
});
