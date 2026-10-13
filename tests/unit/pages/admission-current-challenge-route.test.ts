/** Exercises exact-contact selection boundaries with real schemas and only own application ports. @module admission-current-challenge-route-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionCurrentChallengeHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-current-challenge-handler";

/** @returns Real HTTP proposals and DB-only own ports, without provider or write mocks. */
function fixture() {
  const tribeId = randomUUID(), body = { previousRequestId: randomUUID(), expectedPolicyVersion: 2, channel: "sms", phone: "+5491155501234", country: "AR" };
  const execute = vi.fn(async () => ({ ok: true as const, value: { current: null } }));
  const open = vi.fn(async () => ({ currentChallenge: { execute }, resolveTribe: { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) } }));
  const handler = createAdmissionCurrentChallengeHandler(open);
  const request = (value: unknown, origin = "https://tutribu.example.invalid") => new Request("https://tutribu.example.invalid/api/tribes/synthetic-academy/admissions/challenges/current", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) });
  return { tribeId, body, execute, open, handler, request };
}

describe("current challenge selection route", () => {
  it("should expose a minimal own selection without operation or proof authority", async () => {
    const data = fixture();
    const response = await data.handler(data.request(data.body), { params: Promise.resolve({ slug: "synthetic-academy" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ current: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(data.execute).toHaveBeenCalledWith(expect.objectContaining({ ...data.body, tribeId: data.tribeId, requestId: expect.any(String) }));
  });

  it.each(["userId", "email", "purpose", "verified", "sender", "destination", "connectionId", "operationId", "proofId"])("should reject untrusted %s before native composition", async (field) => {
    const data = fixture();
    const response = await data.handler(data.request({ ...data.body, [field]: "untrusted-authority" }), { params: Promise.resolve({ slug: "synthetic-academy" }) });
    expect(response.status).toBe(400);
    expect(data.open).not.toHaveBeenCalled();
    expect(data.execute).not.toHaveBeenCalled();
  });

  it("should reject a foreign origin before reading any contact", async () => {
    const data = fixture();
    const response = await data.handler(data.request(data.body, "https://foreign.example.invalid"), { params: Promise.resolve({ slug: "synthetic-academy" }) });
    expect(response.status).toBe(403);
    expect(data.open).not.toHaveBeenCalled();
  });
});
