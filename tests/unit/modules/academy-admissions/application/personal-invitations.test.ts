/** Exercises personal invitation lifecycle independently of transport, token material and access persistence. @module personal-invitations-tests */
import { describe, expect, it } from "vitest";
import { createPersonalInvitation, renamePersonalInvitation, revokePersonalInvitation, redeemPersonalInvitation, expirePersonalInvitation } from "@/src/modules/academy-admissions/domain/entities/personal-invitation";

/** @returns A genuine pure email creation intent with future default validity and explicit tenant ownership. */
function fixture() {
  const now = new Date("2026-10-09T12:00:00Z");
  const input = { id: "synthetic-personal-invitation", tribeId: "synthetic-tribe", actorUserId: "synthetic-leader", contact: { type: "email" as const, value: " Recipient.Name+tag@Example.Test " }, internalName: " Grupo inicial ", requiresAllowlist: true, allowlistExemptionAcknowledged: false, now, policy: { contactType: "email" as const, requiresAdditionalVerification: false } };
  return { input, now };
}

describe("personal invitation lifecycle", () => {
  it("should create version one with an exact recipient, seven-day default and no recoverable token or access effect", () => {
    const data = fixture(), invitation = createPersonalInvitation(data.input);
    expect(invitation).toMatchObject({ id: data.input.id, tribeId: data.input.tribeId, contact: { type: "email", value: "recipient.name+tag@example.test" }, internalName: "Grupo inicial", requiresAllowlist: true, status: "active", version: 1, expiresAt: new Date("2026-10-16T12:00:00Z"), redeemedByUserId: null, redeemedRequestId: null });
    expect(invitation).not.toHaveProperty("token"); expect(invitation).not.toHaveProperty("invitationUrl"); expect(invitation).not.toHaveProperty("membership");
  });
  it("should require explicit list exemption and reject phone issuance while additional verification is OFF", () => {
    const data = fixture();
    expect(() => createPersonalInvitation({ ...data.input, requiresAllowlist: false })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(createPersonalInvitation({ ...data.input, requiresAllowlist: false, allowlistExemptionAcknowledged: true, expiresAt: null })).toMatchObject({ requiresAllowlist: false, expiresAt: null });
    expect(() => createPersonalInvitation({ ...data.input, policy: { contactType: "phone", requiresAdditionalVerification: false }, contact: { type: "phone", value: "+5491155501234", country: "AR" } })).toThrowError(expect.objectContaining({ code: "invitation_unavailable" }));
    expect(createPersonalInvitation({ ...data.input, policy: { contactType: "phone", requiresAdditionalVerification: true }, contact: { type: "phone", value: "+5491155501234", country: "AR" } })).toMatchObject({ contact: { type: "phone", value: "+5491155501234", country: "AR" } });
  });
  it("should reject current/past expiry, invalid contact and excessive internal name before proposing an invitation", () => {
    const data = fixture();
    for (const expiresAt of [data.now, new Date("2026-10-08T12:00:00Z"), new Date("invalid")]) expect(() => createPersonalInvitation({ ...data.input, expiresAt })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() => createPersonalInvitation({ ...data.input, contact: { type: "email", value: "invalid" } })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() => createPersonalInvitation({ ...data.input, internalName: "a".repeat(101) })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() => createPersonalInvitation({ ...data.input, internalName: " " })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    const invitation = createPersonalInvitation(data.input);
    expect(() => renamePersonalInvitation({ invitation, expectedVersion: 1, internalName: "", now: data.now })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
  it("should rename only descriptive metadata, keep a current no-op and reject stale values even if they match", () => {
    const data = fixture(), original = createPersonalInvitation(data.input), now = new Date("2026-10-09T12:01:00Z");
    const renamed = renamePersonalInvitation({ invitation: original, expectedVersion: 1, internalName: "Otro grupo", now });
    expect(renamed).toMatchObject({ changed: true, invitation: { ...original, internalName: "Otro grupo", version: 2, updatedAt: now } });
    expect(renamePersonalInvitation({ invitation: renamed.invitation, expectedVersion: 2, internalName: " Otro grupo ", now })).toEqual({ changed: false, invitation: renamed.invitation });
    expect(() => renamePersonalInvitation({ invitation: renamed.invitation, expectedVersion: 1, internalName: "Otro grupo", now })).toThrowError(expect.objectContaining({ code: "invitation_conflict" }));
    expect(original).toMatchObject({ internalName: "Grupo inicial", version: 1 });
  });
  it("should redeem once with explicit request/account, preserve the request-independent expiry and revoke authorization without recycling the token", () => {
    const data = fixture(), original = createPersonalInvitation(data.input), now = new Date("2026-10-09T12:01:00Z");
    const redeemed = redeemPersonalInvitation({ invitation: original, expectedVersion: 1, userId: "synthetic-recipient", requestId: "synthetic-request", now });
    expect(redeemed).toMatchObject({ changed: true, invitation: { status: "redeemed", version: 2, redeemedByUserId: "synthetic-recipient", redeemedRequestId: "synthetic-request", redeemedAt: now, expiresAt: original.expiresAt } });
    expect(expirePersonalInvitation({ invitation: redeemed.invitation, expectedVersion: 2, now: new Date("2026-10-17T12:00:00Z") })).toEqual({ changed: false, invitation: redeemed.invitation });
    expect(() => redeemPersonalInvitation({ invitation: redeemed.invitation, expectedVersion: 2, userId: "other-account", requestId: "other-request", now })).toThrowError(expect.objectContaining({ code: "invitation_unavailable" }));
    const revoked = revokePersonalInvitation({ invitation: redeemed.invitation, expectedVersion: 2, revokeRedeemedAuthorization: true, now });
    expect(revoked).toMatchObject({ changed: true, cancelPendingRequestId: "synthetic-request", invitation: { status: "redeemed", version: 3, authorizationRevokedAt: now } });
    expect(revokePersonalInvitation({ invitation: revoked.invitation, expectedVersion: 3, revokeRedeemedAuthorization: true, now })).toMatchObject({ changed: false, cancelPendingRequestId: null });
  });
  it("should close active revocation and expiry once, and require new confirmation if a stale revoke became a redeemed authorization", () => {
    const data = fixture(), original = createPersonalInvitation(data.input);
    expect(revokePersonalInvitation({ invitation: original, expectedVersion: 1, revokeRedeemedAuthorization: false, now: data.now })).toMatchObject({ changed: true, invitation: { status: "revoked", version: 2 } });
    const expired = expirePersonalInvitation({ invitation: original, expectedVersion: 1, now: new Date("2026-10-16T12:00:00Z") });
    expect(expired).toMatchObject({ changed: true, invitation: { status: "expired", version: 2 } });
    expect(expirePersonalInvitation({ invitation: expired.invitation, expectedVersion: 2, now: new Date("2026-10-17T12:00:00Z") })).toMatchObject({ changed: false });
    expect(() => redeemPersonalInvitation({ invitation: original, expectedVersion: 1, userId: "synthetic-recipient", requestId: "synthetic-request", now: new Date("2026-10-16T12:00:00Z") })).toThrowError(expect.objectContaining({ code: "invitation_unavailable" }));
    const redeemed = redeemPersonalInvitation({ invitation: original, expectedVersion: 1, userId: "synthetic-recipient", requestId: "synthetic-request", now: data.now }).invitation;
    expect(() => revokePersonalInvitation({ invitation: redeemed, expectedVersion: 1, revokeRedeemedAuthorization: false, now: data.now })).toThrowError(expect.objectContaining({ code: "invitation_conflict" }));
    expect(() => revokePersonalInvitation({ invitation: redeemed, expectedVersion: 2, revokeRedeemedAuthorization: false, now: data.now })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
});
