/** @vitest-environment node */
/** Exercises canonical entry identity and configuration versions independently of account binding or membership. @module allowlist-entry-tests */
import { describe, expect, it } from "vitest";
import { createAllowlistEntry, proposeAllowlistEntryChange } from "@/src/modules/academy-admissions/domain/entities/allowlist-entry";

describe("allowlist entry configuration", () => {
  const identity = { id: "synthetic-entry", tribeId: "synthetic-tribe", actorUserId: "synthetic-leader", now: new Date("2026-10-09T03:00:00Z") };

  it("should create version one with an exact normalized email when the leader adds a contact", () => {
    const entry = createAllowlistEntry({ ...identity, contact: { type: "email", value: "  First.Last+group@Example.Test  " }, displayName: "  Nombre orientativo  ", source: "manual" });
    expect(entry).toMatchObject({ id: identity.id, tribeId: identity.tribeId, contact: { type: "email", value: "first.last+group@example.test" }, displayName: "Nombre orientativo", status: "enabled", version: 1, source: "manual", importId: null, createdByUserId: identity.actorUserId, updatedByUserId: identity.actorUserId, createdAt: identity.now, updatedAt: identity.now });
    expect(entry).not.toHaveProperty("ownerUserId");
    expect(entry).not.toHaveProperty("bindingId");
  });

  it("should normalize an unambiguous phone when its explicit country agrees", () => {
    expect(createAllowlistEntry({ ...identity, contact: { type: "phone", value: "+54 9 11 5550-1234", country: "AR" }, source: "manual" })).toMatchObject({ contact: { type: "phone", value: "+5491155501234", country: "AR" }, displayName: null, version: 1 });
  });

  it("should reject invalid contact or name before creating an entry", () => {
    expect(() => createAllowlistEntry({ ...identity, contact: { type: "phone", value: "+5491155501234", country: "US" }, source: "manual" })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() => createAllowlistEntry({ ...identity, contact: { type: "email", value: "valid@example.test" }, displayName: "a".repeat(101), source: "manual" })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(createAllowlistEntry({ ...identity, contact: { type: "email", value: "valid@example.test" }, displayName: " ", source: "manual" }).displayName).toBeNull();
  });

  it("should require the import origin when a server-owned CSV entry is created", () => {
    expect(() => createAllowlistEntry({ ...identity, contact: { type: "email", value: "valid@example.test" }, source: "csv" })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(createAllowlistEntry({ ...identity, contact: { type: "email", value: "valid@example.test" }, source: "csv", importId: "synthetic-import" })).toMatchObject({ version: 1, source: "csv", importId: "synthetic-import" });
    expect(() => createAllowlistEntry({ ...identity, contact: { type: "email", value: "valid@example.test" }, source: "manual", importId: "synthetic-import" })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("should increment once when name and status change together without changing contact or origin", () => {
    const entry = createAllowlistEntry({ ...identity, contact: { type: "email", value: "first.last+tag@example.test" }, source: "manual" });
    const now = new Date("2026-10-09T03:05:00Z");
    const proposal = proposeAllowlistEntryChange({ entry, expectedVersion: 1, patch: { displayName: "Otro nombre", status: "disabled" }, actorUserId: "another-leader", now });
    expect(proposal).toMatchObject({ ok: true, changed: true, entry: { ...entry, displayName: "Otro nombre", status: "disabled", version: 2, updatedByUserId: "another-leader", updatedAt: now } });
    expect(entry).toMatchObject({ status: "enabled", version: 1, displayName: null });
  });

  it("should retain version and timestamps when the current version proposes an equivalent name", () => {
    const entry = createAllowlistEntry({ ...identity, contact: { type: "email", value: "valid@example.test" }, displayName: "Nombre", source: "manual" });
    expect(proposeAllowlistEntryChange({ entry, expectedVersion: 1, patch: { displayName: " Nombre ", status: "enabled" }, actorUserId: "another-leader", now: new Date("2026-10-09T03:05:00Z") })).toEqual({ ok: true, changed: false, entry });
  });

  it("should reject a stale version even when its requested values match", () => {
    const entry = { ...createAllowlistEntry({ ...identity, contact: { type: "email", value: "valid@example.test" }, source: "manual" }), version: 2 };
    expect(proposeAllowlistEntryChange({ entry, expectedVersion: 1, patch: { status: "enabled" }, actorUserId: identity.actorUserId, now: identity.now })).toEqual({ ok: false, code: "allowlist_conflict" });
  });

  it("should reject an empty edit or nonpositive version before proposing effects", () => {
    const entry = createAllowlistEntry({ ...identity, contact: { type: "email", value: "valid@example.test" }, source: "manual" });
    for (const expectedVersion of [0, -1, 1.5, Number.NaN]) expect(proposeAllowlistEntryChange({ entry, expectedVersion, patch: { status: "enabled" }, actorUserId: identity.actorUserId, now: identity.now })).toEqual({ ok: false, code: "invalid_input" });
    expect(proposeAllowlistEntryChange({ entry, expectedVersion: 1, patch: {}, actorUserId: identity.actorUserId, now: identity.now })).toEqual({ ok: false, code: "invalid_input" });
  });
});
