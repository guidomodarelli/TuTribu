/** @vitest-environment node */

/** Exercises canonical contacts without treating declared input as verified identity. */
import { describe, expect, it } from "vitest";

import { normalizeAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";

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
