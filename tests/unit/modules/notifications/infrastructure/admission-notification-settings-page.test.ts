/** @vitest-environment node */
/** Checks the actual SSR input/public-props boundary before native module composition. @module admission-notification-settings-page-loader-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { loadAdmissionNotificationSettingsPageState } from "@/src/modules/notifications/infrastructure/composition/admission-notification-settings-page";

describe("notification settings page boundary", () => {
  it.each([{ scenario: "invalid slug", params: { slug: "?invalid" }, query: {} }, { scenario: "browser identity", params: { slug: "test" }, query: { viewerId: "claimed" } }])("should reject $scenario before opening native services", async ({ params, query }) => {
    const open = vi.fn(async () => { throw new Error("Invalid input must not compose services"); });
    expect(await loadAdmissionNotificationSettingsPageState({ params, query }, open)).toMatchObject({ kind: "unavailable", code: "invalid_input" });
    expect(open).not.toHaveBeenCalled();
  });

  it("should return only the guarded native snapshot through one initial data entrypoint", async () => {
    const value = { kind: "ready" as const, slug: "test", tribeId: randomUUID(), viewerId: randomUUID(), preference: { mode: "omitted" as const, version: 0, source: "implicit" as const }, canConfigureEmail: false, email: null, platformRequirement: null, preparedEmailAvailable: null };
    const execute = vi.fn(async () => ({ ok: true as const, value }));
    expect(await loadAdmissionNotificationSettingsPageState({ params: { slug: "test" }, query: {} }, async () => ({ execute }))).toEqual(value);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({ slug: "test", requestId: expect.any(String) });
  });

  it("should close a platform requirement handed to a viewer who cannot configure the tribe email", async () => {
    const value = { kind: "ready" as const, slug: "test", tribeId: randomUUID(), viewerId: randomUUID(), preference: { mode: "omitted" as const, version: 0, source: "implicit" as const }, canConfigureEmail: false, email: null, platformRequirement: "recovery_locked" as const, preparedEmailAvailable: null };
    expect(await loadAdmissionNotificationSettingsPageState({ params: { slug: "test" }, query: {} }, async () => ({ execute: async () => ({ ok: true as const, value }) }))).toMatchObject({ kind: "unavailable", code: "public_contract_unusable" });
  });

  it("should close an unusable own props object instead of serializing an unexpected field", async () => {
    const value = { kind: "ready" as const, slug: "test", tribeId: randomUUID(), viewerId: randomUUID(), preference: { mode: "omitted" as const, version: 0, source: "implicit" as const }, canConfigureEmail: false, email: null, platformRequirement: null, preparedEmailAvailable: null, privateDiagnostic: "synthetic-private-detail" };
    const result = await loadAdmissionNotificationSettingsPageState({ params: { slug: "test" }, query: {} }, async () => ({ execute: async () => ({ ok: true as const, value }) }));
    expect(result).toMatchObject({ kind: "unavailable", code: "public_contract_unusable" });
    expect(JSON.stringify(result)).not.toContain("synthetic-private-detail");
  });

  it("should keep a leader's missing prepared email in the guarded snapshot", async () => {
    const value = { kind: "ready" as const, slug: "test", tribeId: randomUUID(), viewerId: randomUUID(), preference: { mode: "grouped" as const, version: 0, source: "implicit" as const }, canConfigureEmail: true, email: { enabled: false, version: 0, timeZone: "UTC" }, platformRequirement: null, preparedEmailAvailable: false };
    expect(await loadAdmissionNotificationSettingsPageState({ params: { slug: "test" }, query: {} }, async () => ({ execute: async () => ({ ok: true as const, value }) }))).toEqual(value);
  });

  it.each([
    ["a viewer who cannot configure the tribe email", { canConfigureEmail: false, email: null, platformRequirement: null, preparedEmailAvailable: false }],
    ["an email that is already on", { canConfigureEmail: true, email: { enabled: true, version: 1, timeZone: "UTC" }, platformRequirement: null, preparedEmailAvailable: true }],
    ["a platform that blocks every change", { canConfigureEmail: true, email: { enabled: false, version: 0, timeZone: "UTC" }, platformRequirement: "recovery_locked" as const, preparedEmailAvailable: false }],
  ])("should close an email capability handed for %s", async (_case, patch) => {
    const value = { kind: "ready" as const, slug: "test", tribeId: randomUUID(), viewerId: randomUUID(), preference: { mode: "grouped" as const, version: 0, source: "implicit" as const }, ...patch };
    expect(await loadAdmissionNotificationSettingsPageState({ params: { slug: "test" }, query: {} }, async () => ({ execute: async () => ({ ok: true as const, value }) }))).toMatchObject({ kind: "unavailable", code: "public_contract_unusable" });
  });
});
