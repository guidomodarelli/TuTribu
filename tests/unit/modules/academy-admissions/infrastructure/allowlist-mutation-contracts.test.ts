/** Exercises actual own mutation DTO guards, including completed denials without fabricated entries. @module allowlist-mutation-contract-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { allowlistMutationResultSchema, allowlistMutationSnapshotSchema } from "@/src/modules/academy-admissions/application/results/allowlist-mutation-schemas";

describe("allowlist mutation contracts", () => {
  it("should accept a committed version-one creation and a later no-op without identity payload", () => {
    const entryId = randomUUID();
    expect(allowlistMutationResultSchema.parse({ entryId, version: 1, changed: true, created: true })).toEqual({ entryId, version: 1, changed: true, created: true });
    expect(allowlistMutationResultSchema.parse({ entryId, version: 3, changed: false, created: false })).toEqual({ entryId, version: 3, changed: false, created: false });
  });

  it("should reject invalid counters and a creation misclassified as unchanged", () => {
    const original = { entryId: randomUUID(), version: 1, changed: true, created: true };
    for (const value of [{ ...original, version: 0 }, { ...original, version: 2 }, { ...original, changed: false }]) expect(allowlistMutationResultSchema.safeParse(value).success).toBe(false);
  });

  it("should reject private contact, owner and fingerprint fields instead of forwarding them", () => {
    const original = { entryId: randomUUID(), version: 1, changed: true, created: true };
    for (const privateField of [{ identity: "private@example.test" }, { ownerUserId: randomUUID() }, { contactFingerprint: "private-digest" }]) expect(allowlistMutationResultSchema.safeParse({ ...original, ...privateField }).success).toBe(false);
  });

  it("should recover a completed business denial without requiring or inventing an entry version", () => {
    expect(allowlistMutationSnapshotSchema.parse({ outcome: "denied", code: "allowlist_conflict" })).toEqual({ outcome: "denied", code: "allowlist_conflict" });
    expect(allowlistMutationSnapshotSchema.safeParse({ outcome: "denied", code: "allowlist_conflict", entryId: randomUUID(), version: 0 }).success).toBe(false);
    expect(allowlistMutationSnapshotSchema.safeParse({ outcome: "denied", code: "private_provider_error" }).success).toBe(false);
  });
});
