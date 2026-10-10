/** Exercises durable reference-only contact recovery without persisting code, destination, credential or session. @module admission-contact-intent-tests */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { readAdmissionContactIntent, readEarlierUnresolvedAdmissionContactIntent, writeAdmissionContactIntent, admissionContactIntentKey } from "@/lib/academy-admissions/admission-contact-intent";

afterEach(() => window.sessionStorage.clear());

describe("own contact operation references", () => {
  it("should find only earlier unresolved common originals without crossing viewer, pending or personal scopes", () => {
    const viewerId = randomUUID(), slug = "synthetic-academy", previousRequestId = randomUUID();
    const earlier = { viewerId, slug, requestId: null, previousRequestId: randomUUID(), issuedOperationId: null, verifiedOperationId: null, pending: { kind: "issue" as const, operationId: randomUUID() } };
    writeAdmissionContactIntent({ ...earlier, viewerId: randomUUID() });
    writeAdmissionContactIntent({ ...earlier, previousRequestId: undefined, requestId: randomUUID() });
    writeAdmissionContactIntent({ ...earlier, previousRequestId: undefined, personalScope: "a".repeat(64) });
    writeAdmissionContactIntent({ ...earlier, previousRequestId });
    expect(readEarlierUnresolvedAdmissionContactIntent(viewerId, slug, previousRequestId)).toBeNull();
    writeAdmissionContactIntent(earlier);
    expect(readEarlierUnresolvedAdmissionContactIntent(viewerId, slug, previousRequestId)).toEqual(earlier);
    writeAdmissionContactIntent({ ...earlier, pending: null });
    expect(readEarlierUnresolvedAdmissionContactIntent(viewerId, slug, previousRequestId)).toBeNull();
  });

  it("should isolate a new presentation after an own terminal request without removing earlier operation references", () => {
    const viewerId = randomUUID(), slug = "synthetic-academy", previousRequestId = randomUUID();
    const previous = { viewerId, slug, requestId: null, issuedOperationId: randomUUID(), verifiedOperationId: randomUUID(), pending: null };
    const current = { ...previous, previousRequestId, issuedOperationId: randomUUID(), verifiedOperationId: null };
    writeAdmissionContactIntent(previous);
    writeAdmissionContactIntent(current);
    expect(readAdmissionContactIntent(viewerId, slug, null, undefined, previousRequestId)).toEqual(current);
    expect(readAdmissionContactIntent(viewerId, slug, null)).toEqual(previous);
    expect(readAdmissionContactIntent(viewerId, slug, null, undefined, randomUUID())).toBeNull();
    expect(readAdmissionContactIntent(viewerId, slug, previousRequestId)).toBeNull();
    expect(readAdmissionContactIntent(viewerId, slug, null, "a".repeat(64))).toBeNull();
  });

  it("should isolate personal references from common admission and from another personal proposal", () => {
    const viewerId = randomUUID(), slug = "synthetic-academy", personalScope = "a".repeat(64);
    const record = { viewerId, slug, requestId: null, issuedOperationId: randomUUID(), verifiedOperationId: null, pending: null, personalScope };
    writeAdmissionContactIntent(record);
    expect(readAdmissionContactIntent(viewerId, slug, null, personalScope)).toEqual(record);
    expect(readAdmissionContactIntent(viewerId, slug, null)).toBeNull();
    expect(readAdmissionContactIntent(viewerId, slug, null, "b".repeat(64))).toBeNull();
    const raw = window.sessionStorage.getItem(admissionContactIntentKey(viewerId, slug, null, personalScope));
    expect(raw).not.toContain("invitationToken");
    expect(raw).not.toContain("confirmed");
  });

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

  it.each(["verificationCode", "phone", "email", "recipient", "apiKey", "sessionId", "invitationToken"])("should reject sensitive field %s instead of writing it", (field) => {
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
