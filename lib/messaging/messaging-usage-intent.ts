"use client";
/** Persists only the current account/tribe's original usage intention before a mutation. @module messaging-usage-intent */
import { z } from "zod";
import { messagingUsageBrowserIntentSchema, type MessagingUsageBrowserIntent } from "@/src/modules/messaging/application/commands/messaging-usage-browser-intent";
import { MESSAGING_USAGE_INTENT_STORAGE_PREFIX } from "@/src/modules/messaging/constants/messaging-usage";
/** Storage is an owned boundary; persistence failure prevents the caller from posting. */
type UsageIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const storedIntentSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), pending: messagingUsageBrowserIntentSchema });
/** @param viewerId - Native account. @param slug - Current tribe. @returns An isolated key, never a permission grant. */
function storageKey(viewerId: string, slug: string) { return `${MESSAGING_USAGE_INTENT_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`; }
/** @param viewerId - Native account. @param slug - Current tribe. @param storage - Browser storage port. @returns Original intent or real absence; invalid/foreign data is removed, without restoring UI confirmation. */
export function readMessagingUsageIntent(viewerId: string, slug: string, storage: UsageIntentStorage = window.sessionStorage): MessagingUsageBrowserIntent | null {
  const key = storageKey(viewerId, slug), raw = storage.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { storage.removeItem(key); return null; }
  const parsed = storedIntentSchema.safeParse(value);
  if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug) { storage.removeItem(key); return null; }
  return parsed.data.pending;
}
/** @param viewerId - Native account. @param slug - Current tribe. @param pending - Immutable original intent or confirmed removal. @param storage - Browser persistence port. @returns Only after successful persistence; failure never permits a write. */
export function writeMessagingUsageIntent(viewerId: string, slug: string, pending: MessagingUsageBrowserIntent | null, storage: UsageIntentStorage = window.sessionStorage): void {
  const key = storageKey(viewerId, slug);
  if (!pending) { storage.removeItem(key); return; }
  storage.setItem(key, JSON.stringify(storedIntentSchema.parse({ viewerId, slug, pending })));
}
