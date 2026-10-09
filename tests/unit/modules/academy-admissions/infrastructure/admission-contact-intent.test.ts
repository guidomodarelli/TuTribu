/** Exercises durable reference-only contact recovery without persisting code, destination, credential or session. @module admission-contact-intent-tests */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { readAdmissionContactIntent, writeAdmissionContactIntent, admissionContactIntentKey } from "@/lib/academy-admissions/admission-contact-intent";

afterEach(() => window.sessionStorage.clear());

describe("own contact operation references", () => {
  it("should preserve original operation references per viewer, tribe and optional pending without restoring consent", () => {
    const viewerId = randomUUID(), slug = "synthetic-academy", requestId = randomUUID(), operationId = randomUUID();
    const record = { viewerId, slug, requestId, issuedOperationId: operationId, verifiedOperationId: null, pending: { kind: "verify" as const, operationId: randomUUID(), challengeId: randomUUID() } };
    writeAdmissionContactIntent(record);
    expect(readAdmissionContactIntent(viewerId, slug, requestId)).toEqual(record);
    expect(readAdmissionContactIntent(randomUUID(), slug, requestId)).toBeNull();
    expect(readAdmissionContactIntent(viewerId, "another-academy", requestId)).toBeNull();
    expect(readAdmissionContactIntent(viewerId, slug, null)).toBeNull();
    expect(readAdmissionContactIntent(viewerId, slug, requestId)).not.toHaveProperty("confirmed");
  });

  it.each(["verificationCode", "phone", "email", "recipient", "apiKey", "sessionId"])("should reject sensitive field %s instead of writing it", (field) => {
    const record = { viewerId: randomUUID(), slug: "synthetic-academy", requestId: null, issuedOperationId: null, verifiedOperationId: null, pending: null, [field]: "synthetic-sensitive" };
    expect(() => writeAdmissionContactIntent(record)).toThrow();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("should discard corrupted or foreign references instead of treating them as accepted work", () => {
    const viewerId = randomUUID(), slug = "synthetic-academy", key = admissionContactIntentKey(viewerId, slug, null);
    window.sessionStorage.setItem(key, "{");
    expect(readAdmissionContactIntent(viewerId, slug, null)).toBeNull();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    window.sessionStorage.setItem(key, JSON.stringify({ viewerId: randomUUID(), slug, requestId: null, issuedOperationId: randomUUID(), verifiedOperationId: null, pending: null }));
    expect(readAdmissionContactIntent(viewerId, slug, null)).toBeNull();
    window.sessionStorage.setItem(key, JSON.stringify({ viewerId, slug, requestId: null, issuedOperationId: randomUUID(), verifiedOperationId: null, pending: { kind: "verify", operationId: randomUUID(), challengeId: randomUUID(), verificationCode: "123456" } }));
    expect(readAdmissionContactIntent(viewerId, slug, null)).toBeNull();
  });
});
