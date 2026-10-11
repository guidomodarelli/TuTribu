"use client";

/** Persists only the current viewer's local draft and exact original intent for browser recovery. @module admission-draft */
import { z } from "zod";
import { ADMISSION_DRAFT_STORAGE_PREFIX } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { LEGACY_ADMISSION_ARRIVAL } from "@/src/modules/academy-admissions/constants/legacy-admission-arrival";

/** A restored draft never silently restores user confirmation. */
export const admissionDraftSchema = z.object({ phone: z.string(), country: z.string(), message: z.string().max(ADMISSION_LIMIT.internalMessageCharacters) });
const submissionInputSchema = z.strictObject({ operationId: z.uuid(), confirmed: z.literal(true), expectedPolicyVersion: z.int().positive(), phone: z.string().optional(), country: z.string().optional(), proofId: z.uuid().optional(), message: z.string().max(ADMISSION_LIMIT.internalMessageCharacters).optional() });
const cancellationInputSchema = z.strictObject({ operationId: z.uuid(), confirmed: z.literal(true), expectedVersion: z.int().positive() });
/** This is a local intent; it is never represented as server-accepted progress. */
export const admissionPendingIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("submit"), input: submissionInputSchema }),
  z.object({ kind: z.literal("cancel"), requestId: z.uuid(), input: cancellationInputSchema }),
]);
const storageSchema = z.object({ viewerId: z.string().min(1), slug: z.string().min(1), draft: admissionDraftSchema, pending: admissionPendingIntentSchema.nullable(), arrivalScope: z.string().regex(LEGACY_ADMISSION_ARRIVAL.scopePattern).optional() });
export type AdmissionDraft = z.infer<typeof admissionDraftSchema>;
export type AdmissionPendingIntent = z.infer<typeof admissionPendingIntentSchema>;
export type AdmissionStoredDraft = z.infer<typeof storageSchema>;

/** @param viewerId - Native current user id, never a session/token. @param slug - Validated public tribe slug. @param arrivalScope - Optional one-way historical URL reference. @returns A draft key scoped to viewer, tenant and original arrival. */
export function admissionDraftKey(viewerId: string, slug: string, arrivalScope?: string): string { return `${ADMISSION_DRAFT_STORAGE_PREFIX}:${encodeURIComponent(viewerId)}:${encodeURIComponent(slug)}${arrivalScope ? `:${arrivalScope}` : ""}`; }

/** @param viewerId - Current validated viewer. @param slug - Current tribe. @param arrivalScope - Exact one-way historical reference when present. @returns An owned usable draft or absence; corrupted/foreign data is discarded. @throws When browser session storage is unavailable. */
export function readAdmissionDraft(viewerId: string, slug: string, arrivalScope?: string): AdmissionStoredDraft | null {
  const key = admissionDraftKey(viewerId, slug, arrivalScope), raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { window.sessionStorage.removeItem(key); return null; }
  const parsed = storageSchema.safeParse(value);
  if (!parsed.success || parsed.data.viewerId !== viewerId || parsed.data.slug !== slug || parsed.data.arrivalScope !== arrivalScope) { window.sessionStorage.removeItem(key); return null; }
  return parsed.data;
}

/** @param record - Exact local draft/intent selected by the container. @returns Nothing after durable browser storage; an exception blocks a new write. */
export function writeAdmissionDraft(record: AdmissionStoredDraft): void {
  window.sessionStorage.setItem(admissionDraftKey(record.viewerId, record.slug, record.arrivalScope), JSON.stringify(storageSchema.parse(record)));
}

/** UUID protocol bytes support WebKit contexts without randomUUID; no weak random fallback is used. */
const UUID_GROUP_OFFSET = { first: 0, second: 8, third: 12, fourth: 16, fifth: 20 } as const;
const UUID_PROTOCOL = { byteCount: 16, versionIndex: 6, variantIndex: 8, lowBits: 15, variantBits: 63, versionFour: 64, variantRfc: 128, radix: 16, hexWidth: 2 } as const;
/** @returns An unpredictable RFC UUID only on explicit user intent, never during SSR or the first client render. @throws When secure randomness is unavailable. */
export function newAdmissionOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(UUID_PROTOCOL.byteCount));
  bytes[UUID_PROTOCOL.versionIndex] = (bytes[UUID_PROTOCOL.versionIndex] & UUID_PROTOCOL.lowBits) | UUID_PROTOCOL.versionFour;
  bytes[UUID_PROTOCOL.variantIndex] = (bytes[UUID_PROTOCOL.variantIndex] & UUID_PROTOCOL.variantBits) | UUID_PROTOCOL.variantRfc;
  const hex = Array.from(bytes, (byte) => byte.toString(UUID_PROTOCOL.radix).padStart(UUID_PROTOCOL.hexWidth, "0")).join("");
  const offsets = Object.values(UUID_GROUP_OFFSET);
  return offsets.map((offset, index) => hex.slice(offset, offsets[index + 1])).join("-");
}
