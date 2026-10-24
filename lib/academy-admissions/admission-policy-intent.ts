"use client";
/** Persists one immutable viewer/tribe policy intention before any browser write. @module admission-policy-intent */
import { z } from "zod";
import { admissionPolicyBrowserIntentSchema, type AdmissionPolicyBrowserIntent } from "@/src/modules/academy-admissions/application/commands/admission-policy-browser-intent";
import { ADMISSION_POLICY_STORAGE_PREFIX } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_POLICY_OPERATION } from "@/src/modules/academy-admissions/constants/admission-policy";

/** The own storage boundary is injectable without replacing browser or framework libraries. */
type AdmissionPolicyIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const storedIntentSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), pending: admissionPolicyBrowserIntentSchema });
/** An update stored before the messaging reference became server-owned still carries it; new writes never include it. */
const legacyStoredUpdateSchema = z.object({ pending: z.object({ type: z.literal(ADMISSION_POLICY_OPERATION.update), input: z.object({ messagingConnectionId: z.uuid().nullable(), messagingConnectionVersion: z.int().positive().nullable() }) }) });

/**
 * Keeps an unresolved update saved by the previous release recoverable by its original operation UUID.
 * Only the two reference fields are dropped: a retry is offered only when that operation was never registered, and a registered one rejects a different payload.
 * @param value - Parsed stored JSON. @returns The same value, without the legacy messaging reference when it is the only difference.
 */
function withoutLegacyMessagingReference(value: unknown): unknown {
  if (!legacyStoredUpdateSchema.safeParse(value).success) return value;
  const stored = value as { pending: { input: Record<string, unknown> } };
  const { messagingConnectionId: _messagingConnectionId, messagingConnectionVersion: _messagingConnectionVersion, ...input } = stored.pending.input;
  return { ...stored, pending: { ...stored.pending, input } };
}
/** @param viewerId - Native account. @param slug - Current tribe. @returns An isolated key, never a permission token. */
function policyIntentKey(viewerId: string, slug: string): string {
  return `${ADMISSION_POLICY_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}`;
}

/** @param viewerId - Native account. @param slug - Current tribe. @param storage - Own browser persistence port. @returns The original scoped intention; invalid or foreign input is removed. */
export function readAdmissionPolicyIntent(viewerId: string, slug: string, storage: AdmissionPolicyIntentStorage = window.sessionStorage): AdmissionPolicyBrowserIntent | null {
  const key = policyIntentKey(viewerId, slug), raw = storage.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { storage.removeItem(key); return null; }
  const parsed = storedIntentSchema.safeParse(withoutLegacyMessagingReference(value));
  if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug) { storage.removeItem(key); return null; }
  return parsed.data.pending;
}

/** @param viewerId - Native account. @param slug - Current tribe. @param pending - Original intent or confirmed removal. @param storage - Own persistence port. @returns Only after persistence; an error prevents the caller from writing. */
export function writeAdmissionPolicyIntent(viewerId: string, slug: string, pending: AdmissionPolicyBrowserIntent | null, storage: AdmissionPolicyIntentStorage = window.sessionStorage): void {
  const key = policyIntentKey(viewerId, slug);
  if (!pending) { storage.removeItem(key); return; }
  const stored = storedIntentSchema.parse({ viewerId, slug, pending });
  storage.setItem(key, JSON.stringify(stored));
}
