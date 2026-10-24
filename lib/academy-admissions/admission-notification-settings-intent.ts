"use client";
/** Preserves the original scoped email command across confirmation and uncertain replies without persisting secrets. @module admission-notification-settings-intent */
import type { AdmissionNotificationEmailSettingsCommand } from "@/src/modules/notifications/domain/repositories/admission-notification-email-settings-repository";
import { admissionNotificationEmailSettingsStoredIntentSchema, ADMISSION_NOTIFICATION_SETTINGS_STORAGE_PREFIX } from "@/src/modules/notifications/constants/admission-notification-settings-page";

/** The project's own browser persistence edge is injectable without mocking platform libraries. */
type IntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** @param viewerId - Native current account id, never authority. @param slug - Current tenant route. @returns An isolated local key. */
function intentKey(viewerId: string, slug: string): string { return `${ADMISSION_NOTIFICATION_SETTINGS_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`; }
/** @param viewerId - Account verified before reading storage. @param slug - Current route. @param storage - Own persistence edge. @returns Exact original body or absence after removing invalid/foreign state. */
export function readAdmissionNotificationSettingsIntent(viewerId: string, slug: string, storage: IntentStorage = window.sessionStorage): AdmissionNotificationEmailSettingsCommand | null {
  const key = intentKey(viewerId, slug), raw = storage.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { storage.removeItem(key); return null; }
  const parsed = admissionNotificationEmailSettingsStoredIntentSchema.safeParse(value);
  if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug) { storage.removeItem(key); return null; }
  return parsed.data.input;
}
/** @param viewerId - Verified original account. @param slug - Current tribe. @param input - Exact prior body or removal after known completion. @param storage - Own persistence edge. @returns After persistence; an exception must prevent a new request. */
export function writeAdmissionNotificationSettingsIntent(viewerId: string, slug: string, input: AdmissionNotificationEmailSettingsCommand | null, storage: IntentStorage = window.sessionStorage): void {
  const key = intentKey(viewerId, slug);
  if (!input) { storage.removeItem(key); return; }
  storage.setItem(key, JSON.stringify(admissionNotificationEmailSettingsStoredIntentSchema.parse({ viewerId, slug, input })));
}
