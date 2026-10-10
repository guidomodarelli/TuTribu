/** Exercises actual own JSON/header guards with doubles confined to HTTP and the minimal native viewer port. @module personal-invitation-management-api-client-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPersonalInvitationManagementApiClient } from "@/lib/academy-admissions/personal-invitation-management-api-client";
import type { PersonalInvitationManagementIntent } from "@/src/modules/academy-admissions/application/commands/personal-invitation-management-intent";

/** @returns An explicit confirmed original create request and an actual canonical response URL. */
function fixture() {
  const operationId = randomUUID(), viewerId = randomUUID(), result = { invitationId: randomUUID(), version: 1, created: true, changed: true }, url = `https://tutribu.example.test/admissions/invitations/${randomBytes(32).toString("base64url")}`;
  const intent: PersonalInvitationManagementIntent = { type: "create_personal_invitation", input: { operationId, confirmed: true, internalName: "Grupo", recipient: { type: "email", value: "recipient@example.test" }, requiresAllowlist: false, acknowledgeNoAllowlist: true, expiresAt: null } };
  const body = { state: "completed", operationId, replayed: false, result, invitationUrl: url }, headers = { "x-tutribu-admission-viewer": JSON.stringify({ viewerId }) };
  return { operationId, viewerId, result, url, intent, body, headers };
}
describe("personal invitation management browser adapter", () => {
  it("should accept the configured public origin independently of the browser host and refuse dispatch without that contract", async () => {
    const data = fixture(), canonical = "https://canonical.example.test", body = { ...data.body, invitationUrl: data.url.replace("tutribu.example.test", "canonical.example.test") };
    const transport = vi.fn(async () => Response.json(body, { headers: data.headers }));
    const client = createPersonalInvitationManagementApiClient({ fetch: transport, origin: () => canonical });
    expect(await client.write("synthetic", data.intent, new AbortController().signal)).toEqual({ status: "ready", value: { outcome: body, viewerId: data.viewerId } });
    transport.mockClear();
    expect(await createPersonalInvitationManagementApiClient({ fetch: transport }).write("synthetic", data.intent, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
    expect(transport).not.toHaveBeenCalled();
  });
  it("should consume the initial own URL with actual viewer metadata and perform exactly one same-origin POST", async () => {
    const data = fixture(), transport = vi.fn(async () => Response.json(data.body, { status: 201, headers: data.headers }));
    const client = createPersonalInvitationManagementApiClient({ fetch: transport, origin: () => "https://tutribu.example.test" });
    expect(await client.write("synthetic", data.intent, new AbortController().signal)).toEqual({ status: "ready", value: { outcome: data.body, viewerId: data.viewerId } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith("/api/tribes/synthetic/admissions/invitations", expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store" }));
  });
  it.each([null, "{broken", JSON.stringify({ viewerId: null }), JSON.stringify({ viewerId: "viewer", session: "private" })])("should preserve original uncertainty for unusable native viewer metadata %s", async (metadata) => {
    const data = fixture(), transport = vi.fn(async () => Response.json(data.body, { headers: metadata === null ? {} : { "x-tutribu-admission-viewer": metadata } }));
    const client = createPersonalInvitationManagementApiClient({ fetch: transport, origin: () => "https://tutribu.example.test" });
    expect(await client.write("synthetic", data.intent, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("should reject a foreign URL or secret fields on a replay instead of reconstructing creation material", async () => {
    const data = fixture(), transport = vi.fn(async () => Response.json({ ...data.body, invitationUrl: data.url.replace("tutribu.example.test", "other.example.test") }, { headers: data.headers }));
    const client = createPersonalInvitationManagementApiClient({ fetch: transport, origin: () => "https://tutribu.example.test" });
    expect(await client.write("synthetic", data.intent, new AbortController().signal)).toMatchObject({ status: "failed", uncertain: true });
    transport.mockResolvedValueOnce(Response.json({ ...data.body, replayed: true }, { headers: data.headers }));
    expect(await client.write("synthetic", data.intent, new AbortController().signal)).toMatchObject({ status: "failed", uncertain: true });
  });
  it("should classify genuine 202 original progress without treating it as an absent or safe-to-repeat mutation", async () => {
    const data = fixture(), transport = vi.fn(async () => Response.json({ code: "operation_unresolved", message: "La operación está registrada y su resultado todavía no se confirmó. Consultá su estado.", requestId: "synthetic", operation: { operationId: data.operationId, state: "started" } }, { status: 202 }));
    const client = createPersonalInvitationManagementApiClient({ fetch: transport, origin: () => "https://tutribu.example.test" });
    const result = await client.write("synthetic", data.intent, new AbortController().signal);
    expect(result).toMatchObject({ status: "failed", code: "operation_unresolved", uncertain: true });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("should bind original GET to the actual server viewer and never request a new creation", async () => {
    const data = fixture(), original = { type: "create_personal_invitation", state: "completed", operationId: data.operationId, replayed: true, result: data.result }, transport = vi.fn(async () => Response.json(original, { headers: data.headers }));
    const client = createPersonalInvitationManagementApiClient({ fetch: transport });
    expect(await client.operation("synthetic", data.operationId, new AbortController().signal)).toEqual({ status: "ready", value: { original, viewerId: data.viewerId } });
    expect(transport).toHaveBeenCalledWith(`/api/tribes/synthetic/admissions/operations/${data.operationId}`, expect.objectContaining({ cache: "no-store" }));
  });
});
