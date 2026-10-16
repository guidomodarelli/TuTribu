/** Exercises complete generic content through its domain contract without reading source text. @module admission-notification-email-content-tests */
import { describe, expect, it } from "vitest";
import { createAdmissionNotificationEmailIntent } from "@/src/modules/notifications/domain/policies/admission-notification-email-content";
import type { AdmissionNotificationGroupManifest, AdmissionNotificationEvent } from "@/src/modules/notifications/domain/entities/admission-notification";

/** @returns Original safe reference metadata independent of any provider, note or contact. */
function manifest(): AdmissionNotificationGroupManifest {
  return { format: 1, identity: { tribeId: "tribe-a", recipientUserId: "recipient-a", audience: "reviewer", mode: "grouped", preferenceVersion: 2, emailSettingsVersion: 3, individualObligationId: null, window: { startsAtMicroseconds: 1_791_979_200_000_001, closesAtMicroseconds: 1_791_979_500_000_001, timeZone: "America/Argentina/Buenos_Aires" } }, items: [{ obligationId: "original-a", admissionRequestId: "request-a", event: "pending_created", createdAtMicroseconds: 1_791_979_200_000_001, deadlineAtMicroseconds: 1_792_065_600_000_001 }] };
}

/** @param original - Exact frozen reference metadata. @returns Complete own intent with a passive authenticated consultation path. */
const prepare = (original = manifest()) => createAdmissionNotificationEmailIntent({ groupId: "group-a", groupVersion: 2, manifest: original, senderId: "sender-a", href: "https://example.test/test/academia/admissions" });

describe("admission notification complete email content", () => {
  it("should render a fixed reviewer consultation message and project only owned manifest fields", () => {
    // Given accidental extra runtime metadata that must never join the immutable intent.
    const source = { ...manifest(), privateNote: "private-note-canary", destination: "private@example.invalid" };
    const intent = prepare(source);
    expect(intent).toMatchObject({ format: 1, kind: "admission_notification_group", groupId: "group-a", groupVersion: 2, channel: "email", senderId: "sender-a", subject: "TuTribu: solicitudes de ingreso pendientes" });
    expect(intent.text).toContain("Tenés una solicitud de ingreso pendiente para revisar.");
    expect(intent.text).toContain("Necesitás iniciar sesión:");
    expect(intent.text).toContain(intent.href);
    expect(intent.text).toContain("Abrir este enlace no aprueba ni rechaza solicitudes.");
    expect(JSON.stringify(intent)).not.toContain("private-note-canary");
    expect(JSON.stringify(intent)).not.toContain("private@example.invalid");
    expect(intent.manifest).toEqual(manifest());
    expect(intent.manifest).not.toBe(source);
  });

  it("should include every frozen reviewer reference and preserve its native microseconds", () => {
    const source = manifest();
    const original = { ...source, items: [...source.items, { ...source.items[0], obligationId: "original-b", admissionRequestId: "request-b", event: "reminder" as const }] };
    const intent = prepare(original);
    expect(intent.text).toContain("Tenés 2 avisos de solicitudes de ingreso pendientes para revisar.");
    expect(intent.manifest.items).toEqual(original.items);
    expect(intent.manifest.items[0].createdAtMicroseconds % 1_000).toBe(1);
  });

  it.each([{ event: "approved", summary: "Tu solicitud de ingreso fue aprobada." }, { event: "rejected", summary: "Tu solicitud de ingreso fue rechazada." }, { event: "cancelled", summary: "Tu solicitud de ingreso fue cancelada." }, { event: "expired", summary: "Tu solicitud de ingreso venció." }] as const)("should render the applicant's original $event outcome without accepting a decision reason", ({ event, summary }) => {
    const source = manifest();
    const intent = prepare({ ...source, identity: { ...source.identity, audience: "applicant", mode: "individual", preferenceVersion: 0, individualObligationId: source.items[0].obligationId }, items: [{ ...source.items[0], event }] });
    expect(intent.subject).toBe("TuTribu: novedades de tu solicitud de ingreso");
    expect(intent.text).toContain(summary);
  });

  it.each(["approved", "rejected", "cancelled", "expired"] as const)("should reject a reviewer manifest containing applicant event %s", (event) => {
    const source = manifest();
    expect(() => prepare({ ...source, items: [{ ...source.items[0], event }] })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it.each(["pending_created", "reminder"] as const)("should reject applicant event %s instead of producing a reviewer message", (event: AdmissionNotificationEvent) => {
    const source = manifest();
    expect(() => prepare({ ...source, identity: { ...source.identity, audience: "applicant", mode: "individual", preferenceVersion: 0, individualObligationId: source.items[0].obligationId }, items: [{ ...source.items[0], event }] })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("should reject empty and multiple-applicant manifests", () => {
    const source = manifest();
    expect(() => prepare({ ...source, items: [] })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() => prepare({ ...source, identity: { ...source.identity, audience: "applicant", mode: "individual", preferenceVersion: 0, individualObligationId: source.items[0].obligationId }, items: [{ ...source.items[0], event: "approved" }, { ...source.items[0], obligationId: "other", event: "approved" }] })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
});
