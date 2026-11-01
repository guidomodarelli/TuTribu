/** @vitest-environment node */
/** Exercises actual own DTO/error guards and transport options without replacing framework, SDK or Zod libraries. @module admission-notification-settings-browser-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAdmissionNotificationSettingsApiClient } from "@/lib/academy-admissions/admission-notification-settings-api-client";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** @param value - Synthetic own response, never a provider payload. @param viewerId - Native response binding. @param status - Actual HTTP status. @returns A real Fetch response at the project's own HTTP edge. */
function response(value: unknown, viewerId: string | null, status = 200) {
  return Response.json(value, { status, headers: viewerId === null ? {} : { "x-tutribu-admission-viewer": JSON.stringify({ viewerId }) } });
}

describe("notification settings browser transport", () => {
  it("should read a minimal preference on the relative same-origin route with native viewer binding", async () => {
    const viewerId = randomUUID(), value = { preference: { mode: "omitted", version: 0, source: "implicit" }, canConfigureEmail: false };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(value, viewerId)), signal = new AbortController().signal;
    const client = createAdmissionNotificationSettingsApiClient({ fetch });

    expect(await client.readPreference("test", signal)).toEqual({ status: "ready", value: { viewerId, data: value } });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/tribes/test/admissions/notification-preferences", { credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal) });
  });

  it.each(["security_unconfigured", "recovery_locked", null] as const)("should read the current tribe email with its closed platform requirement %s", async (platformRequirement) => {
    const viewerId = randomUUID(), value = { settings: { enabled: false, version: 0, timeZone: "UTC" }, platformRequirement };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(value, viewerId));

    expect(await createAdmissionNotificationSettingsApiClient({ fetch }).readEmail("test", new AbortController().signal)).toEqual({ status: "ready", value: { viewerId, data: value } });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/tribes/test/admissions/email-settings", { credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal) });
  });

  it.each(["missing_viewer", "malformed_viewer", "invalid_body", "unknown_requirement"])("should close an own read with %s", async (scenario) => {
    const value = { settings: { enabled: false, version: 0, timeZone: "UTC" }, platformRequirement: scenario === "unknown_requirement" ? "keys_rotated" : null };
    const result = response(scenario === "invalid_body" ? { ...value, secretRef: randomUUID() } : value, scenario === "missing_viewer" ? null : randomUUID());
    if (scenario === "malformed_viewer") result.headers.set("x-tutribu-admission-viewer", "invalid-json");
    const client = createAdmissionNotificationSettingsApiClient({ fetch: async () => result });
    expect(await client.readEmail("test", new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: false });
  });

  it("should preserve HTTP200 personal version conflict as a rejected result instead of a save", async () => {
    const viewerId = randomUUID(), value = { status: "rejected", reason: "notification_preference_version_conflict" };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(value, viewerId));
    const result = await createAdmissionNotificationSettingsApiClient({ fetch }).changePreference("test", { mode: "daily", expectedVersion: 1 }, new AbortController().signal);
    expect(result).toEqual({ status: "ready", value: { viewerId, data: value } });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ mode: "daily", expectedVersion: 1 }) });
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).not.toHaveProperty("operationId");
  });

  it("should refuse a wrong committed frequency and retain uncertainty after a sent write", async () => {
    const client = createAdmissionNotificationSettingsApiClient({ fetch: async () => response({ status: "changed", preference: { mode: "individual", version: 2, source: "stored" } }, randomUUID()) });
    expect(await client.changePreference("test", { mode: "daily", expectedVersion: 1 }, new AbortController().signal)).toMatchObject({ status: "failed", code: "public_contract_unusable", uncertain: true });
  });

  it("should reject authority fields before sending an own preference write", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(), input = { mode: "daily" as const, expectedVersion: 0, recipientUserId: randomUUID() };
    expect(await createAdmissionNotificationSettingsApiClient({ fetch }).changePreference("test", input, new AbortController().signal)).toMatchObject({ status: "failed", code: "invalid_input", uncertain: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should preserve genuine registered progress and the exact email command without retrying", async () => {
    const input = { operationId: randomUUID(), confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "UTC" }, viewerId = randomUUID();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({ state: "started", operationId: input.operationId }, viewerId, 202));
    const result = await createAdmissionNotificationSettingsApiClient({ fetch }).changeEmail("test", input, new AbortController().signal);
    expect(result).toEqual({ status: "ready", value: { viewerId, data: { state: "started", operationId: input.operationId } } });
    expect(fetch).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify(input) });
  });

  it("should retain a registered unresolved error with its original reference", async () => {
    const input = { operationId: randomUUID(), confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "UTC" };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({ code: "operation_unresolved", message: ADMISSION_ERROR_MESSAGE.operation_unresolved, requestId: randomUUID(), operation: { state: "started", operationId: input.operationId } }, null, 202));
    expect(await createAdmissionNotificationSettingsApiClient({ fetch }).changeEmail("test", input, new AbortController().signal)).toMatchObject({ status: "failed", code: "operation_unresolved", uncertain: true });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("should treat a platform-blocked email change as a definite rejection, never as an uncertain write", async () => {
    const input = { operationId: randomUUID(), confirmed: true as const, expectedVersion: 0, enabled: true, timeZone: "UTC" };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({ code: "platform_security_unavailable", message: ADMISSION_ERROR_MESSAGE.platform_security_unavailable, requestId: randomUUID() }, null, 409));
    expect(await createAdmissionNotificationSettingsApiClient({ fetch }).changeEmail("test", input, new AbortController().signal)).toEqual({ status: "failed", code: "platform_security_unavailable", message: ADMISSION_ERROR_MESSAGE.platform_security_unavailable, uncertain: false });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["original", "foreign_type", "foreign_uuid"])("should bind %s recovery to the original email namespace and UUID", async (scenario) => {
    const operationId = randomUUID(), viewerId = randomUUID();
    const value = { type: scenario === "foreign_type" ? "initialize_admission_policy" : "update_admission_email_settings", state: "started", operationId: scenario === "foreign_uuid" ? randomUUID() : operationId };
    const client = createAdmissionNotificationSettingsApiClient({ fetch: async () => response(value, viewerId) });
    expect(await client.operation("test", operationId, new AbortController().signal)).toMatchObject(scenario === "original" ? { status: "ready", value: { viewerId, data: { state: "started", operationId } } } : { status: "failed", code: "public_contract_unusable" });
  });

  it("should cancel before any read or command is dispatched", async () => {
    const controller = new AbortController(); controller.abort();
    const fetch = vi.fn<typeof globalThis.fetch>(), client = createAdmissionNotificationSettingsApiClient({ fetch });
    expect(await client.readPreference("test", controller.signal)).toEqual({ status: "aborted" });
    expect(await client.changePreference("test", { mode: "daily", expectedVersion: 0 }, controller.signal)).toEqual({ status: "aborted" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should preserve write uncertainty when the own transport loses the response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new TypeError("Synthetic transport reply lost"); });
    expect(await createAdmissionNotificationSettingsApiClient({ fetch }).changePreference("test", { mode: "daily", expectedVersion: 0 }, new AbortController().signal)).toMatchObject({ status: "failed", code: "dependency_unavailable", uncertain: true });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
