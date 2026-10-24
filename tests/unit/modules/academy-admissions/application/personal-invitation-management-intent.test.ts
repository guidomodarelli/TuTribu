/** Exercises actual pre-action contracts for recipient, UTC expiry and separately acknowledged administrative actions. @module personal-invitation-management-intent-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emptyPersonalInvitationManagementDraft, preparePersonalInvitationManagementIntent } from "@/src/modules/academy-admissions/application/commands/prepare-personal-invitation-management-intent";
import type { PersonalInvitationManagementPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-management-page-state";

/** @returns A deterministic current server proposal with no fabricated confirmation or existing resource. */
function fixture() {
  const state: Extract<PersonalInvitationManagementPageState, { kind: "ready" }> = { kind: "ready", slug: "synthetic", tribeId: randomUUID(), viewerId: randomUUID(), renderedAt: "2026-10-09T12:00:00Z", contactType: "email", requiresAdditionalVerification: false, hasUsableAllowlist: true, allowedCountries: ["AR"], page: { items: [], nextCursor: null }, query: { limit: 25 } };
  const draft = { ...emptyPersonalInvitationManagementDraft(state), internalName: " Grupo ", identity: " Recipient.Name+tag@Example.Test " };
  return { state, draft, operationId: randomUUID(), now: new Date(state.renderedAt) };
}

describe("personal invitation management pre-action intent", () => {
  it("should reject a changed recipient in an explicitly selected replacement before dispatch", () => {
    const data = fixture(), selected = { id: randomUUID(), version: 2, internalName: "Grupo", recipient: { type: "email" as const, value: "recipient.name+tag@example.test" }, requiresAllowlist: true, expiresAt: null, status: "active" as const, createdAt: data.state.renderedAt, redeemedAt: null, revokedAt: null, authorizationRevokedAt: null };
    const draft = { ...data.draft, selected, replaceSelected: true, replacementAcknowledged: true };
    expect(preparePersonalInvitationManagementIntent(data.state, draft, data.operationId, data.now)).toMatchObject({ input: { replacement: { invitationId: selected.id, expectedVersion: 2 } } });
    expect(() => preparePersonalInvitationManagementIntent(data.state, { ...draft, identity: "another@example.test" }, data.operationId, data.now)).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    for (const status of ["redeemed", "revoked", "expired"] as const) expect(() => preparePersonalInvitationManagementIntent(data.state, { ...draft, selected: { ...selected, status } }, data.operationId, data.now)).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
  it("should default to seven UTC days and a usable list without restoring exemption or final consent", () => {
    const data = fixture();
    expect(data.draft).toMatchObject({ expiry: "2026-10-16T12:00", requiresAllowlist: true, exemptionAcknowledged: false, replacementAcknowledged: false });
    expect(preparePersonalInvitationManagementIntent(data.state, data.draft, data.operationId, data.now)).toEqual({ type: "create_personal_invitation", input: { operationId: data.operationId, confirmed: true, internalName: "Grupo", recipient: { type: "email", value: "recipient.name+tag@example.test" }, requiresAllowlist: true, expiresAt: "2026-10-16T12:00:00.000Z" } });
  });
  it.each(["2026-10-09T11:59", "2026-02-30T12:00", "2026-13-01T12:00", "invalid", ""])("should reject a past or impossible UTC date %s before any writer", (expiry) => {
    const data = fixture(); expect(() => preparePersonalInvitationManagementIntent(data.state, { ...data.draft, expiry }, data.operationId, data.now)).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
  it("should require independent acknowledgements for missing list and indefinite expiry", () => {
    const data = fixture(); data.state.hasUsableAllowlist = false;
    const proposal = { ...data.draft, requiresAllowlist: false, noExpiry: true };
    expect(() => preparePersonalInvitationManagementIntent(data.state, proposal, data.operationId, data.now)).toThrow();
    expect(() => preparePersonalInvitationManagementIntent(data.state, { ...proposal, exemptionAcknowledged: true }, data.operationId, data.now)).toThrow();
    expect(preparePersonalInvitationManagementIntent(data.state, { ...proposal, exemptionAcknowledged: true, noExpiryAcknowledged: true }, data.operationId, data.now)).toMatchObject({ input: { requiresAllowlist: false, acknowledgeNoAllowlist: true, expiresAt: null } });
  });
  it("should refuse phone OFF and a phone outside the current country owner", () => {
    const data = fixture(); data.state.contactType = "phone";
    const draft = { ...data.draft, identity: "+5491112345678", country: "AR" };
    expect(() => preparePersonalInvitationManagementIntent(data.state, draft, data.operationId, data.now)).toThrow();
    data.state.requiresAdditionalVerification = true;
    expect(preparePersonalInvitationManagementIntent(data.state, draft, data.operationId, data.now)).toMatchObject({ input: { recipient: { type: "phone", country: "AR" } } });
    data.state.allowedCountries = ["GB"];
    expect(() => preparePersonalInvitationManagementIntent(data.state, draft, data.operationId, data.now)).toThrow();
  });
});
