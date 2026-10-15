/** @vitest-environment node */
/** Exercises real input, projection and public DTO guards with doubles only for application ports. @module admission-notification-settings-http-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionNotificationSettingsHandlers } from "@/src/modules/notifications/infrastructure/api/admission-notification-settings-handlers";
import type { AdmissionNotificationPreferencesUseCases } from "@/src/modules/notifications/application/use-cases/admission-notification-preferences-use-cases";
import type { AdmissionNotificationEmailSettingsUseCases } from "@/src/modules/notifications/application/use-cases/admission-notification-email-settings-use-cases";

/** @returns Controlled inward application results and requests without substituting auth, Zod or HTTP libraries. */
function fixture() {
  const tribeId = randomUUID(), userId = randomUUID(), operationId = randomUUID();
  const preference = { tribeId, recipientUserId: userId, mode: "grouped" as const, version: 0, effectiveFrom: null, source: "implicit" as const };
  const settings = { tribeId, enabled: false, version: 0, enabledAtMicroseconds: null as number | null, timeZone: "America/Argentina/Buenos_Aires" };
  const preferences = {
    read: vi.fn<AdmissionNotificationPreferencesUseCases["read"]>(async () => ({ ok: true, value: { preference, canConfigureEmail: true } })),
    change: vi.fn<AdmissionNotificationPreferencesUseCases["change"]>(async () => ({ ok: true, value: { status: "changed", preference: { ...preference, mode: "daily", version: 1, effectiveFrom: "2026-10-15 19:00:00.123456+00" } } })),
  };
  const email = {
    read: vi.fn<AdmissionNotificationEmailSettingsUseCases["read"]>(async () => ({ ok: true, value: settings })),
    change: vi.fn<AdmissionNotificationEmailSettingsUseCases["change"]>(async () => ({ ok: true, value: { state: "started", operationId } })),
  };
  const services = { resolveTribe: { execute: vi.fn(async () => ({ ok: true as const, value: { tribeId } })) }, preferences, email };
  const open = vi.fn(async () => services);
  const handlers = createAdmissionNotificationSettingsHandlers(open);
  const context = { params: Promise.resolve({ slug: "synthetic-academy" }) };
  /** @param body - Explicit untrusted JSON body, absent for GET. @param query - Untrusted query selection. @param origin - Browser's real same-origin claim. @returns A native request through the real handler boundary. */
  const request = (body?: unknown, query = "", origin = "https://app.example.test") => new Request(`https://app.example.test/api/tribes/synthetic-academy/admissions/notification-preferences${query}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", origin, "x-request-id": randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const command = { operationId, confirmed: true, expectedVersion: 0, enabled: true, timeZone: "Asia/Kolkata" };
  return { tribeId, userId, operationId, preference, settings, services, open, handlers, context, request, command };
}

describe("admission notification settings HTTP", () => {
  // Public metadata omits native recipients, exact cuts, credentials and private adapter fields.
  it("should publish only the own preference view when a current read succeeds", async () => {
    const data = fixture(), marker = randomUUID();
    Object.assign(data.preference, { privateNote: marker });
    const request = data.request();

    const response = await data.handlers.readOwnPreference(request, data.context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ preference: { mode: "grouped", version: 0, source: "implicit" }, canConfigureEmail: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-request-id")).toBe(request.headers.get("x-request-id"));
    expect(data.services.preferences.change).not.toHaveBeenCalled();
    expect(data.services.email.read).not.toHaveBeenCalled();
  });

  it("should publish the independent OFF state when a leader reads email settings without a mutation", async () => {
    const data = fixture();

    const response = await data.handlers.readEmailSettings(data.request(), data.context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false, version: 0, timeZone: "America/Argentina/Buenos_Aires" });
    expect(data.services.email.change).not.toHaveBeenCalled();
    expect(data.services.preferences.read).not.toHaveBeenCalled();
  });

  it.each([{ mode: "unknown", expectedVersion: 0 }, { mode: "daily", expectedVersion: -1 }, { mode: "daily", expectedVersion: 0, userId: "browser-actor" }])("should reject untrusted preference input $mode at version $expectedVersion before opening composition", async (body) => {
    const data = fixture();

    expect((await data.handlers.changeOwnPreference(data.request(body), data.context)).status).toBe(400);
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should reject browser capability claims and missing confirmation before an email command", async () => {
    const data = fixture();

    expect((await data.handlers.changeEmailSettings(data.request({ ...data.command, preparedEmail: true }), data.context)).status).toBe(400);
    expect((await data.handlers.changeEmailSettings(data.request({ ...data.command, confirmed: false }), data.context)).status).toBe(400);
    expect((await data.handlers.readOwnPreference(data.request(undefined, "?recipientUserId=foreign"), data.context)).status).toBe(400);
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should deny foreign origins before either write opens a service", async () => {
    const data = fixture();

    expect((await data.handlers.changeOwnPreference(data.request({ mode: "daily", expectedVersion: 0 }, "", "https://foreign.example.test"), data.context)).status).toBe(403);
    expect((await data.handlers.changeEmailSettings(data.request(data.command, "", "https://foreign.example.test"), data.context)).status).toBe(403);
    expect(data.open).not.toHaveBeenCalled();
  });

  it("should preserve a personal CAS rejection when no preference was saved", async () => {
    const data = fixture();
    data.services.preferences.change.mockResolvedValue({ ok: true, value: { status: "rejected", reason: "notification_preference_version_conflict" } });

    const response = await data.handlers.changeOwnPreference(data.request({ mode: "daily", expectedVersion: 0 }), data.context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "rejected", reason: "notification_preference_version_conflict" });
  });

  it("should retain registered progress when the original email command has no confirmed completion", async () => {
    const data = fixture();

    const response = await data.handlers.changeEmailSettings(data.request(data.command), data.context);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: "started", operationId: data.operationId });
    expect(data.services.email.change).toHaveBeenCalledWith({ ...data.command, tribeId: data.tribeId, requestId: expect.any(String) });
    expect(data.services.email.read).not.toHaveBeenCalled();
  });

  it("should retain the original unresolved reference when a lost completion is an application failure", async () => {
    const data = fixture();
    data.services.email.change.mockResolvedValue({ ok: false, failure: { code: "operation_unresolved", operation: { state: "started", operationId: data.operationId } } });

    const response = await data.handlers.changeEmailSettings(data.request(data.command), data.context);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ code: "operation_unresolved", operation: { state: "started", operationId: data.operationId } });
    expect(data.services.email.read).not.toHaveBeenCalled();
  });

  it("should retain the original historical email reply when a later query has a different current version", async () => {
    const data = fixture();
    data.services.email.change.mockResolvedValue({ ok: true, value: { state: "completed", operationId: data.operationId, replayed: true, result: { status: "changed", settings: { ...data.settings, enabled: true, enabledAtMicroseconds: 1792090800123456, version: 1, timeZone: "Asia/Kolkata" } } } });
    Object.assign(data.settings, { version: 2, timeZone: "UTC" });

    const response = await data.handlers.changeEmailSettings(data.request(data.command), data.context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "completed", operationId: data.operationId, replayed: true, result: { status: "changed", settings: { enabled: true, version: 1, timeZone: "Asia/Kolkata" } } });
    expect(data.services.email.read).not.toHaveBeenCalled();
    const current = await data.handlers.readEmailSettings(data.request(), data.context);
    expect(await current.json()).toEqual({ enabled: false, version: 2, timeZone: "UTC" });
  });

  // Own-result guards run once at the public boundary, independently of upstream/SQL contracts.
  it.each(["foreign_email_scope", "foreign_operation", "incoherent_preference_version", "enabled_without_version", "wrong_committed_mode", "wrong_committed_email_settings"])("should close the public DTO when the inward result has %s", async (scenario) => {
    const data = fixture();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      let response: Response;
      if (scenario === "foreign_email_scope") {
        data.settings.tribeId = randomUUID();
        response = await data.handlers.readEmailSettings(data.request(), data.context);
      } else if (scenario === "foreign_operation") {
        data.services.email.change.mockResolvedValue({ ok: true, value: { state: "started", operationId: randomUUID() } });
        response = await data.handlers.changeEmailSettings(data.request(data.command), data.context);
      } else if (scenario === "enabled_without_version") {
        data.settings.enabled = true;
        response = await data.handlers.readEmailSettings(data.request(), data.context);
      } else if (scenario === "wrong_committed_mode") {
        data.services.preferences.change.mockResolvedValue({ ok: true, value: { status: "changed", preference: { ...data.preference, mode: "individual", version: 1, effectiveFrom: "2026-10-15 19:00:00.123456+00" } } });
        response = await data.handlers.changeOwnPreference(data.request({ mode: "daily", expectedVersion: 0 }), data.context);
      } else if (scenario === "wrong_committed_email_settings") {
        data.services.email.change.mockResolvedValue({ ok: true, value: { state: "completed", operationId: data.operationId, replayed: false, result: { status: "changed", settings: { ...data.settings, enabled: true, version: 1, enabledAtMicroseconds: 1792090800123456, timeZone: "UTC" } } } });
        response = await data.handlers.changeEmailSettings(data.request(data.command), data.context);
      } else {
        data.preference.version = 1;
        response = await data.handlers.readOwnPreference(data.request(), data.context);
      }
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ code: "public_contract_unusable" });
    } finally { quiet.mockRestore(); }
  });

  it("should publish only a safe failure when current authority is denied or storage throws", async () => {
    const data = fixture(), marker = randomUUID();
    data.services.email.change.mockResolvedValue({ ok: false, failure: { code: "reauthentication_required" } });
    expect((await data.handlers.changeEmailSettings(data.request(data.command), data.context)).status).toBe(401);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      data.open.mockRejectedValue(new Error(marker));
      const response = await data.handlers.readOwnPreference(data.request(), data.context);
      expect(response.status).toBe(500);
      const value = await response.json();
      expect(value).toMatchObject({ code: "unexpected_failure", message: expect.any(String), requestId: expect.any(String) });
      expect(JSON.stringify(value)).not.toContain(marker);
    } finally { quiet.mockRestore(); }
  });
});
