/** @vitest-environment node */
/** Verifies exact original command retention through an owned persistence port. @module admission-notification-settings-intent-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readAdmissionNotificationSettingsIntent, writeAdmissionNotificationSettingsIntent } from "@/lib/academy-admissions/admission-notification-settings-intent";

/** @returns An in-memory implementation of the project's own narrow storage port. */
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
/** @returns Synthetic original input without Google proof, account fields or secrets. */
function input() { return { operationId: randomUUID(), confirmed: true as const, expectedVersion: 2, enabled: true, timeZone: "Asia/Kolkata" }; }

describe("original admission email settings intent", () => {
  it("should restore the exact UUID and command only within its original viewer and tribe", () => {
    const data = storage(), viewerId = randomUUID(), original = input();
    writeAdmissionNotificationSettingsIntent(viewerId, "test", original, data);
    expect(readAdmissionNotificationSettingsIntent(viewerId, "test", data)).toEqual(original);
    expect(readAdmissionNotificationSettingsIntent(randomUUID(), "test", data)).toBeNull();
    expect(readAdmissionNotificationSettingsIntent(viewerId, "other", data)).toBeNull();
    expect(data.values.size).toBe(1);
  });

  it.each(["invalid_json", "foreign_viewer", "extra_field"])("should remove %s instead of restoring a foreign or unusable command", (scenario) => {
    const data = storage(), viewerId = randomUUID();
    writeAdmissionNotificationSettingsIntent(viewerId, "test", input(), data);
    const key = [...data.values.keys()][0];
    const value = JSON.parse(data.values.get(key)!);
    if (scenario === "foreign_viewer") value.viewerId = randomUUID();
    if (scenario === "extra_field") value.input.sessionId = randomUUID();
    data.setItem(key, scenario === "invalid_json" ? "invalid-json" : JSON.stringify(value));
    expect(readAdmissionNotificationSettingsIntent(viewerId, "test", data)).toBeNull();
    expect(data.values.size).toBe(0);
  });

  it("should remove the original only after explicit confirmed cleanup", () => {
    const data = storage(), viewerId = randomUUID();
    writeAdmissionNotificationSettingsIntent(viewerId, "test", input(), data);
    writeAdmissionNotificationSettingsIntent(viewerId, "test", null, data);
    expect(readAdmissionNotificationSettingsIntent(viewerId, "test", data)).toBeNull();
  });

  it("should propagate storage failure so callers cannot dispatch an unpersisted command", () => {
    const data = { ...storage(), setItem: () => { throw new Error("Synthetic storage denied"); } };
    expect(() => writeAdmissionNotificationSettingsIntent(randomUUID(), "test", input(), data)).toThrow("Synthetic storage denied");
  });
});
