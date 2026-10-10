/** Exercises original browser policy intentions and draft rules without platform mocks. @module admission-policy-browser-intent-tests */
import { describe, expect, it } from "vitest";
import { readAdmissionPolicyIntent, writeAdmissionPolicyIntent } from "@/lib/academy-admissions/admission-policy-intent";
import { createAdmissionPolicyDraft, validateAdmissionPolicyBrowserDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-browser-intent";
import type { AdmissionPolicyStateDto } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";

/** Supplies only the current own projection; no absence is represented by a fabricated persisted version. */
function state(): AdmissionPolicyStateDto {
  return { state: "not_configured", controlActivated: false, policy: null, usage: null, preparation: { state: "not_evaluated", requirements: [] }, impact: { pendingRequestCount: 0, contactTypeLocked: false, historicalLinksProtected: false, warnings: [] } };
}

describe("policy browser intention", () => {
  it("should retain one original version and payload only for the exact account and tribe", () => {
    const storage = new Map<string, string>();
    const port = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
    const intent = { type: "update_admission_policy" as const, input: { operationId: "297d47c2-5419-4c3d-a339-e8b7970275ca", confirmed: true as const, expectedVersion: 7, ...createAdmissionPolicyDraft(state()), requiresAdditionalVerification: true } };
    writeAdmissionPolicyIntent("synthetic-leader", "synthetic-academy", intent, port);
    expect(readAdmissionPolicyIntent("synthetic-leader", "synthetic-academy", port)).toEqual(intent);
    expect(readAdmissionPolicyIntent("different-leader", "synthetic-academy", port)).toBeNull();
    expect(readAdmissionPolicyIntent("synthetic-leader", "another-academy", port)).toBeNull();
    const original = [...storage.entries()][0];
    storage.set(original[0], JSON.stringify({ viewerId: "different-leader", slug: "synthetic-academy", pending: intent }));
    expect(readAdmissionPolicyIntent("synthetic-leader", "synthetic-academy", port)).toBeNull();
    expect(storage.size).toBe(0);
  });

  it("should reject imported server authority or a second country owner before storing any write", () => {
    const storage = new Map<string, string>();
    const port = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
    const intent = { type: "update_admission_policy" as const, input: { operationId: "297d47c2-5419-4c3d-a339-e8b7970275ca", confirmed: true as const, expectedVersion: 7, ...createAdmissionPolicyDraft(state()), allowedCountries: ["AR"], prepared: true } };
    expect(() => writeAdmissionPolicyIntent("synthetic-leader", "synthetic-academy", intent, port)).toThrow();
    expect(storage.size).toBe(0);
  });

  it("should permit an incomplete verification draft while blocking incompatible settings and a locked contact change", () => {
    const current = state(), draft = createAdmissionPolicyDraft(current);
    expect(draft).toMatchObject({ mode: "manual_review", contactType: "email", isOpen: false, requiresAdditionalVerification: false, messagingConnectionId: null });
    expect(validateAdmissionPolicyBrowserDraft({ ...draft, requiresAdditionalVerification: true }, current)).toBeNull();
    expect(validateAdmissionPolicyBrowserDraft({ ...draft, contactType: "phone", mode: "allowlist" }, current)).toBe("phone_allowlist_verification_required");
    expect(validateAdmissionPolicyBrowserDraft({ ...draft, allowSmsAlternative: true }, current)).toBe("sms_alternative_invalid");
    const protectedState: AdmissionPolicyStateDto = { ...current, state: "paused", controlActivated: true, policy: { id: "83ecbfaf-0e7c-4afb-aefc-62b62800d367", version: 3, verificationEpoch: 1, ...draft, activatedAt: "2026-10-07T09:00:00Z", usage: null, requirements: [] }, impact: { ...current.impact, contactTypeLocked: true, historicalLinksProtected: true } };
    expect(validateAdmissionPolicyBrowserDraft({ ...draft, contactType: "phone" }, protectedState)).toBe("contact_type_locked");
  });
});
