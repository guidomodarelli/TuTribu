/** @vitest-environment node */
/** Exercises real HTTP/DTO boundaries with a controlled own transport and actual native SDK. @module personal-invitation-api-client-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPersonalInvitationApiClient } from "@/lib/academy-admissions/personal-invitation-api-client";

describe("personal invitation browser API", () => {
  it("should change account through the real native sign-out SDK without redeeming or issuing a code", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ success: true }));
    const client = createPersonalInvitationApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.changeAccount(new AbortController().signal)).toEqual({ status: "ready", value: null });
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]?.[0])).toMatch(/\/api\/auth\/sign-out$/);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("should keep native sign-out rejection private and honor cancellation without navigation", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ code: "FORBIDDEN", message: "private provider message" }, { status: 403 }));
    const client = createPersonalInvitationApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    const result = await client.changeAccount(new AbortController().signal);
    expect(result).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: false });
    expect(JSON.stringify(result)).not.toContain("private provider message");
    const controller = new AbortController(); controller.abort();
    expect(await client.changeAccount(controller.signal)).toEqual({ status: "aborted" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("should read a safe canonical proposal without sending recipient, session or mutation input", async () => {
    const token = randomBytes(32).toString("base64url"), proofId = randomUUID();
    const viewerId = randomUUID();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ state: "unavailable", safeMessage: "No podemos continuar con esta invitación desde esta cuenta. Podés cambiar de cuenta o usar otra vía de ingreso." }, { headers: { "x-tutribu-admission-viewer": JSON.stringify({ viewerId }) } }));
    const client = createPersonalInvitationApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.overview(token, proofId, new AbortController().signal)).toMatchObject({ status: "ready", value: { viewerId, preview: { state: "unavailable" } } });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/admissions/invitations/${token}/overview?proofId=${proofId}`, expect.objectContaining({ credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer", signal: expect.any(AbortSignal) }));
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });

  it("should reject invalid token or proof before dispatch and honor pre-aborted reads", async () => {
    const token = randomBytes(32).toString("base64url"), fetch = vi.fn<typeof globalThis.fetch>();
    const client = createPersonalInvitationApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.overview("invalid", undefined, new AbortController().signal)).toMatchObject({ status: "failed", code: "invalid_input", uncertain: false });
    expect(await client.overview(token, "invalid", new AbortController().signal)).toMatchObject({ status: "failed", code: "invalid_input" });
    const controller = new AbortController(); controller.abort();
    expect(await client.overview(token, undefined, controller.signal)).toEqual({ status: "aborted" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([null, "{", JSON.stringify({ viewerId: null }), JSON.stringify({ viewerId: randomUUID(), sessionId: "private" })])("should reject missing or incompatible own viewer metadata before exposing a preview", async (metadata) => {
    const token = randomBytes(32).toString("base64url");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ state: "unavailable", safeMessage: "No podemos continuar con esta invitación desde esta cuenta. Podés cambiar de cuenta o usar otra vía de ingreso." }, { headers: metadata ? { "x-tutribu-admission-viewer": metadata } : {} }));
    const client = createPersonalInvitationApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.overview(token, undefined, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
  });

  it("should preserve a native anonymous scope without inventing an authenticated viewer", async () => {
    const token = randomBytes(32).toString("base64url");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ state: "sign_in_required", safeMessage: "Iniciá sesión para consultar esta invitación personal." }, { headers: { "x-tutribu-admission-viewer": JSON.stringify({ viewerId: null }) } }));
    const client = createPersonalInvitationApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.overview(token, undefined, new AbortController().signal)).toEqual({ status: "ready", value: { viewerId: null, preview: { state: "sign_in_required", safeMessage: "Iniciá sesión para consultar esta invitación personal." } } });
  });

  it("should reject private hints in an unavailable own DTO and sanitize transport failures", async () => {
    const token = randomBytes(32).toString("base64url");
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ state: "unavailable", safeMessage: "No podemos continuar con esta invitación desde esta cuenta. Podés cambiar de cuenta o usar otra vía de ingreso.", recipient: "private@example.test" })).mockRejectedValueOnce(new Error(`Private provider ${token}`));
    const client = createPersonalInvitationApiClient({ fetch, viewer: async () => ({ status: "ready", value: null }) });
    expect(await client.overview(token, undefined, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
    const result = await client.overview(token, undefined, new AbortController().signal);
    expect(result).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: false });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain("provider");
  });

  it("should preserve exact personal submission identity and retain uncertainty on a lost reply", async () => {
    const invitationToken = randomBytes(32).toString("base64url"), operationId = randomUUID();
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new Error("Synthetic lost reply"));
    const client = createPersonalInvitationApiClient({ fetch, viewer: async () => ({ status: "ready", value: { id: randomUUID() } }) });
    expect(await client.submit("synthetic-academy", { operationId, confirmed: true, expectedPolicyVersion: 1, invitationToken }, new AbortController().signal)).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: true });
    expect(fetch).toHaveBeenCalledWith("/api/tribes/synthetic-academy/admissions/submissions", expect.objectContaining({ method: "POST", body: JSON.stringify({ operationId, confirmed: true, expectedPolicyVersion: 1, invitationToken }) }));
  });

  it("should delegate only current native viewer and original operation metadata reads", async () => {
    const viewerId = randomUUID(), operationId = randomUUID(), viewer = vi.fn(async () => ({ status: "ready" as const, value: { id: viewerId } }));
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ type: "submit_admission", state: "started", operationId }));
    const client = createPersonalInvitationApiClient({ fetch, viewer });
    expect(await client.viewer(new AbortController().signal)).toEqual({ status: "ready", value: { id: viewerId } });
    expect(await client.operation("synthetic-academy", operationId, new AbortController().signal)).toMatchObject({ status: "ready", value: { operationId, state: "started" } });
    expect(fetch).toHaveBeenCalledWith(`/api/tribes/synthetic-academy/admissions/operations/${operationId}`, expect.objectContaining({ cache: "no-store" }));
  });
});
