/** @vitest-environment node */

/** Exercises canonical contacts without treating declared input as verified identity. */
import { describe, expect, it } from "vitest";

import { admissionContactStoredValues, canonicalizeStoredAdmissionContact, isSameAdmissionContact, normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";

describe("admission contact normalization", () => {
  it("should preserve dots and tags when canonicalizing an email address", () => {
    // Arrange and act.
    const tagged = normalizeAdmissionContact({ type: "email", value: " Student.Name+Spring@GMAIL.COM " });
    const untagged = normalizeAdmissionContact({ type: "email", value: "studentname@gmail.com" });

    // Assert: matching never invents ownership equivalence between aliases.
    expect(tagged).toEqual({ status: "valid", contact: { type: "email", value: "student.name+spring@gmail.com" } });
    expect(untagged).toEqual({ status: "valid", contact: { type: "email", value: "studentname@gmail.com" } });
    expect(tagged).not.toEqual(untagged);
  });

  it.each(["", "not-an-address", "one@example.invalid\nother@example.invalid", "one two@example.invalid"])(
    "should reject an unusable email when its input is %j", (value) => {
      expect(normalizeAdmissionContact({ type: "email", value })).toMatchObject({ status: "invalid", reason: "contact_invalid" });
    },
  );

  it("should derive the destination country when an international phone is valid", () => {
    expect(normalizeAdmissionContact({ type: "phone", value: "+54 9 11 4444 5555" })).toEqual({
      status: "valid", contact: { type: "phone", value: "+5491144445555", country: "AR" },
    });
  });

  it.each([["+54 11 4444 5555", undefined], ["11 4444 5555", "AR"], ["+54 9 11 4444 5555", undefined], ["011 15 4444 5555", "AR"]])("should give an Argentine mobile written as %j its mobile form", (value, country) => {
    expect(normalizeAdmissionContact({ type: "phone", value, country })).toEqual({ status: "valid", contact: { type: "phone", value: "+5491144445555", country: "AR" } });
  });

  it("should keep a provincial Argentine number written without its 9 on the mobile form and leave other countries untouched", () => {
    expect(normalizeAdmissionContact({ type: "phone", value: "+54 351 555 1234" })).toEqual({ status: "valid", contact: { type: "phone", value: "+5493515551234", country: "AR" } });
    expect(normalizeAdmissionContact({ type: "phone", value: "+1 202 555 0123" })).toEqual({ status: "valid", contact: { type: "phone", value: "+12025550123", country: "US" } });
  });

  it("should still match the values saved before an Argentine mobile took its 9", () => {
    expect(admissionContactStoredValues({ type: "phone", value: "+5491144445555", country: "AR" })).toEqual(["+5491144445555", "+541144445555"]);
    expect(admissionContactStoredValues({ type: "phone", value: "+12025550123", country: "US" })).toEqual(["+12025550123"]);
    expect(admissionContactStoredValues({ type: "email", value: "student@example.test" })).toEqual(["student@example.test"]);
  });

  it("should treat an Argentine mobile and the form saved without its 9 as the same contact from either side", () => {
    const canonical = { type: "phone", value: "+5491144445555", country: "AR" }, historical = { type: "phone", value: "+541144445555" };
    expect(isSameAdmissionContact(canonical, historical)).toBe(true);
    expect(isSameAdmissionContact(historical, canonical)).toBe(true);
    expect(isSameAdmissionContact(canonical, { type: "phone", value: "+5491144445555" })).toBe(true);
  });

  it.each([
    ["another number", { type: "phone", value: "+541144445556" }],
    ["another country", { type: "phone", value: "+11144445555" }],
    ["an email with the same text", { type: "email", value: "+541144445555" }],
  ])("should keep a different contact distinct when it is %s", (_case, other) => {
    expect(isSameAdmissionContact({ type: "phone", value: "+5491144445555", country: "AR" }, other)).toBe(false);
  });

  it("should not match a missing contact", () => {
    expect(isSameAdmissionContact(null, { type: "phone", value: "+5491144445555" })).toBe(false);
    expect(isSameAdmissionContact({ type: "email", value: "student@example.test" }, null)).toBe(false);
  });

  it("should canonicalize a stored phone saved without its 9 and leave other stored contacts unchanged", () => {
    expect(canonicalizeStoredAdmissionContact({ type: "phone", value: "+541144445555", country: "AR" })).toEqual({ type: "phone", value: "+5491144445555", country: "AR" });
    expect(canonicalizeStoredAdmissionContact({ type: "phone", value: "+12025550123", country: "US" })).toEqual({ type: "phone", value: "+12025550123", country: "US" });
    expect(canonicalizeStoredAdmissionContact({ type: "email", value: "student@example.test" })).toEqual({ type: "email", value: "student@example.test" });
  });

  it("should normalize a national phone when its country is explicitly provided", () => {
    expect(normalizeAdmissionContact({ type: "phone", value: "202 555 0123", country: "US" })).toEqual({
      status: "valid", contact: { type: "phone", value: "+12025550123", country: "US" },
    });
  });

  it("should reject a national phone when its country would be ambiguous", () => {
    expect(normalizeAdmissionContact({ type: "phone", value: "2025550123" })).toMatchObject({ status: "invalid", reason: "contact_country_required" });
  });

  it("should reject a spoofed country when the international phone belongs elsewhere", () => {
    expect(normalizeAdmissionContact({ type: "phone", value: "+12025550123", country: "AR" })).toMatchObject({ status: "invalid", reason: "contact_country_mismatch" });
  });

  it("should reject an extension when the destination must be one canonical mobile contact", () => {
    expect(normalizeAdmissionContact({ type: "phone", value: "+12025550123 ext. 123" })).toMatchObject({ status: "invalid", reason: "contact_invalid" });
  });

  it.each(["+123", "not-a-phone", "+12025550123 extra text"])(
    "should reject an unusable phone when its input is %j", (value) => {
      expect(normalizeAdmissionContact({ type: "phone", value })).toMatchObject({ status: "invalid", reason: "contact_invalid" });
    },
  );
});
