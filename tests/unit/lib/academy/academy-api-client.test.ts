import { beforeEach, describe, expect, it, type Mock } from "vitest";

import {
  ACADEMY_API_FALLBACK_MESSAGE,
  decideMemberVerification,
  fetchOwnAcademyAccess,
  grantAcademyBonus,
  startAcademyCheckout,
} from "@/lib/academy/academy-api-client";

const fetchMock = global.fetch as Mock;

function respondWithJson(body: unknown, status: number) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status })
  );
}

const accessDto = {
  accessEndsAt: "2026-07-01T03:00:00.000Z",
  accessModel: "academy",
  canStartCheckout: false,
  eligibility: "verified",
  firstActivatedAt: "2026-06-01T03:00:00.000Z",
  hasBonusCoverage: true,
  hasPaidCoverage: false,
  isLeaderPreview: false,
  level: "academy",
  nextAction: "continue_learning",
  renewalStatus: "none",
};

const queueItem = {
  declaredEmail: null,
  decisionReason: null,
  id: "5d3f4b1a-8a6e-4c1d-9f2e-3b4a5c6d7e8f",
  memberDisplayName: "Persona",
  memberUserId: "user-1",
  providerDisplayName: "Broker A",
  providerId: "6e4f5c2b-9b7f-4d2e-8a3f-4c5b6d7e8f90",
  reviewedAt: "2026-06-02T12:00:00.000Z",
  status: "verified",
  updatedAt: "2026-06-02T12:00:00.000Z",
  version: 3,
};

describe("academy api client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returns the own access status when the DTO matches its contract", async () => {
    respondWithJson(accessDto, 200);

    const result = await fetchOwnAcademyAccess("mi-tribu");

    expect(result).toEqual({ data: accessDto, isSuccess: true, status: 200 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/tribes/mi-tribu/academy/access");
  });

  it("rejects a DTO with unexpected fields safely", async () => {
    respondWithJson({ ...accessDto, internalPaymentId: "pay-1" }, 200);

    await expect(fetchOwnAcademyAccess("mi-tribu")).resolves.toEqual({
      isSuccess: false,
      message: ACADEMY_API_FALLBACK_MESSAGE,
      status: 200,
    });
  });

  it("surfaces the safe route message of a failed checkout", async () => {
    respondWithJson({ message: "La venta de la academia está pausada.", status: "sales_closed" }, 409);

    await expect(startAcademyCheckout("mi-tribu", 2)).resolves.toMatchObject({
      isSuccess: false,
      message: "La venta de la academia está pausada.",
      status: 409,
    });
  });

  it("returns the current state sent with a decision conflict", async () => {
    respondWithJson(queueItem, 409);

    const result = await decideMemberVerification("mi-tribu", queueItem.id, {
      decision: "rejected",
      expectedVersion: 2,
      reason: "No coincide",
    });

    expect(result).toMatchObject({ conflictData: queueItem, isSuccess: false, status: 409 });
  });

  it("maps a network failure to the fallback message", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network"));

    await expect(
      grantAcademyBonus("mi-tribu", {
        allowUnverifiedRecipient: false,
        endsAt: "2026-07-01T03:00:00.000Z",
        idempotencyKey: "7f5a6d3c-0c8a-4e3f-9b4a-5d6e7f8091a2",
        reason: "Bonificación",
        recipientUserId: "user-1",
      })
    ).resolves.toEqual({ isSuccess: false, message: ACADEMY_API_FALLBACK_MESSAGE, status: 0 });
  });
});
