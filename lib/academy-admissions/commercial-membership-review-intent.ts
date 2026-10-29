"use client";
/** Persists one viewer/tribe commercial membership decision before it is sent, so an uncertain answer is recovered instead of repeated. @module commercial-membership-review-intent */
import { z } from "zod";
import { COMMERCIAL_MEMBERSHIP_DECISION, COMMERCIAL_MEMBERSHIP_REASON_MAX_CHARACTERS, COMMERCIAL_MEMBERSHIP_RECOVERY_STATUSES, COMMERCIAL_MEMBERSHIP_REVIEW_ROLES, COMMERCIAL_MEMBERSHIP_REVIEW_STATUSES, COMMERCIAL_MEMBERSHIP_REVIEW_STATUS_REASONS, COMMERCIAL_MEMBERSHIP_REVIEW_STORAGE_PREFIX } from "@/src/modules/academy-admissions/constants/commercial-membership-review";
import { buildScopedIntentKey, readScopedIntentRecord, type ScopedIntentStorage as IntentStorage } from "@/lib/scoped-intent-storage";
import type { CommercialMembershipResolutionBrowserInput } from "@/src/modules/academy-admissions/application/ports/commercial-membership-review-browser-client";

/** The pending decision, its member and the visible name used by its confirmation message. */
export type CommercialMembershipReviewIntent = { memberId: string; memberName: string; input: CommercialMembershipResolutionBrowserInput };

const intentSchema = z.strictObject({
  memberId: z.uuid(), memberName: z.string().min(1),
  input: z.strictObject({
    operationId: z.uuid(), confirmed: z.literal(true), decision: z.enum(COMMERCIAL_MEMBERSHIP_DECISION),
    expected: z.strictObject({ role: z.enum(COMMERCIAL_MEMBERSHIP_REVIEW_ROLES), status: z.enum(COMMERCIAL_MEMBERSHIP_REVIEW_STATUSES), statusReason: z.enum(COMMERCIAL_MEMBERSHIP_REVIEW_STATUS_REASONS), recoveryStatus: z.enum(COMMERCIAL_MEMBERSHIP_RECOVERY_STATUSES).nullable() }),
    reason: z.string().max(COMMERCIAL_MEMBERSHIP_REASON_MAX_CHARACTERS).nullable(),
  }),
});
const storedSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), pending: intentSchema });

/** @param viewerId - Native account. @param slug - Current tribe. @returns An isolated storage key, never a permission token. */
function intentKey(viewerId: string, slug: string): string {
  return buildScopedIntentKey(COMMERCIAL_MEMBERSHIP_REVIEW_STORAGE_PREFIX, viewerId, slug);
}

/** @param viewerId - Native account. @param slug - Current tribe. @param storage - Browser persistence port. @returns The scoped pending decision; invalid or foreign input is removed. */
export function readCommercialMembershipReviewIntent(viewerId: string, slug: string, storage: IntentStorage = window.sessionStorage): CommercialMembershipReviewIntent | null {
  const stored = readScopedIntentRecord(storedSchema, { viewerId, slug }, intentKey(viewerId, slug), storage);
  return stored ? stored.pending : null;
}

/** @param viewerId - Native account. @param slug - Current tribe. @param pending - Decision to keep, or null once confirmed. @param storage - Browser persistence port. @returns Only after persisting; an error stops the caller before sending. */
export function writeCommercialMembershipReviewIntent(viewerId: string, slug: string, pending: CommercialMembershipReviewIntent | null, storage: IntentStorage = window.sessionStorage): void {
  const key = intentKey(viewerId, slug);
  if (!pending) { storage.removeItem(key); return; }
  storage.setItem(key, JSON.stringify(storedSchema.parse({ viewerId, slug, pending })));
}
