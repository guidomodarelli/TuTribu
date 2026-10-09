/** @vitest-environment node */
/** Exercises native request/response and actual Zod boundaries without framework or logger mocks. @module personal-invitation-preview-handler-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPersonalInvitationPreviewHandler } from "@/src/modules/academy-admissions/infrastructure/api/personal-invitation-preview-handler";

describe("personal preview HTTP boundary", () => {
  it("should guard inputs before composition and preserve private headers on invalid token or unexpected query", async () => {
    const open = vi.fn(async () => ({ preview: { execute: async () => ({ ok: true as const, value: { state: "sign_in_required", safeMessage: "Iniciá sesión para consultar esta invitación personal." } }) } }));
    const handler = createPersonalInvitationPreviewHandler(open), token = randomBytes(32).toString("base64url");
    const invalid = await handler(new Request("https://example.test/api/admissions/invitations/invalid/overview"), { params: Promise.resolve({ token: "invalid" }) });
    expect(invalid.status).toBe(400); expect(invalid.headers.get("cache-control")).toBe("no-store"); expect(invalid.headers.get("referrer-policy")).toBe("no-referrer");
    const unexpected = await handler(new Request(`https://example.test/api/admissions/invitations/${token}/overview?role=leader`), { params: Promise.resolve({ token }) });
    expect(unexpected.status).toBe(400); expect(open).not.toHaveBeenCalled();
  });
  it("should return the guarded generic view and pass only the original token, proof reference and safe correlation to the own port", async () => {
    const token = randomBytes(32).toString("base64url"), proofId = randomUUID(), requestId = randomUUID();
    const execute = vi.fn(async () => ({ ok: true as const, value: { state: "unavailable", safeMessage: "No podemos continuar con esta invitación desde esta cuenta. Podés cambiar de cuenta o usar otra vía de ingreso." } }));
    const handler = createPersonalInvitationPreviewHandler(async () => ({ preview: { execute } }));
    const response = await handler(new Request(`https://example.test/api/admissions/invitations/${token}/overview?proofId=${proofId}`, { headers: { "x-request-id": requestId } }), { params: Promise.resolve({ token }) });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(execute).toHaveBeenCalledWith({ token, proofId, requestId });
    const body = await response.json(); expect(body).toEqual({ state: "unavailable", safeMessage: "No podemos continuar con esta invitación desde esta cuenta. Podés cambiar de cuenta o usar otra vía de ingreso." });
    expect(JSON.stringify(body)).not.toContain(token);
  });
  it("should close an own unusable DTO rather than serializing private material or provider copy", async () => {
    const token = randomBytes(32).toString("base64url");
    const handler = createPersonalInvitationPreviewHandler(async () => ({ preview: { execute: async () => ({ ok: true as const, value: { state: "unavailable", safeMessage: "Private provider copy", recipient: "hidden@example.test", token } }) } }));
    const response = await handler(new Request(`https://example.test/api/admissions/invitations/${token}/overview`), { params: Promise.resolve({ token }) });
    expect(response.status).toBe(500);
    const body = await response.json(); expect(body).toMatchObject({ code: "public_contract_unusable" });
    expect(JSON.stringify(body)).not.toContain(token); expect(JSON.stringify(body)).not.toContain("hidden@example.test"); expect(JSON.stringify(body)).not.toContain("Private provider copy");
  });
});
