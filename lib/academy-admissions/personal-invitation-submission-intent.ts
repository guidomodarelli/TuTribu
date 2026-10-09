"use client";
/** Persists reference-only personal canje recovery, without token, destination, proof or consent. @module personal-invitation-submission-intent */
import type { z } from "zod";
import { PERSONAL_INVITATION_SUBMISSION_STORAGE_PREFIX, personalInvitationSubmissionIntentSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-browser";

/** Scope and original operation identify local recovery, never server authorization. */
export type PersonalInvitationSubmissionIntent = z.infer<typeof personalInvitationSubmissionIntentSchema>;

/** @param scope - Current viewer/tribe and non-recoverable route digest. @returns A token-free isolated storage key. */
function submissionKey(scope: Omit<PersonalInvitationSubmissionIntent, "operationId">): string {
  return `${PERSONAL_INVITATION_SUBMISSION_STORAGE_PREFIX}:${encodeURIComponent(scope.viewerId)}:${encodeURIComponent(scope.slug)}:${scope.personalScope}`;
}

/** @param scope - Actual current browser scope. @returns Only an exact owned original reference; corrupt or foreign values are discarded. @throws When browser storage is unavailable. */
export function readPersonalInvitationSubmissionIntent(scope: Omit<PersonalInvitationSubmissionIntent, "operationId">): PersonalInvitationSubmissionIntent | null {
  const key = submissionKey(scope), raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { window.sessionStorage.removeItem(key); return null; }
  const parsed = personalInvitationSubmissionIntentSchema.safeParse(value);
  if (!parsed.success || parsed.data.viewerId !== scope.viewerId || parsed.data.slug !== scope.slug || parsed.data.personalScope !== scope.personalScope) { window.sessionStorage.removeItem(key); return null; }
  return parsed.data;
}

/** @param intent - Original reference written before dispatch. @returns After validating and durably storing references only. @throws When forbidden fields or unavailable storage make recovery unsafe. */
export function writePersonalInvitationSubmissionIntent(intent: PersonalInvitationSubmissionIntent): void {
  const value = personalInvitationSubmissionIntentSchema.parse(intent);
  window.sessionStorage.setItem(submissionKey(value), JSON.stringify(value));
}

/** @param scope - Original exact viewer/proposal scope. @returns After removing only its terminal reference. */
export function clearPersonalInvitationSubmissionIntent(scope: Omit<PersonalInvitationSubmissionIntent, "operationId">): void {
  window.sessionStorage.removeItem(submissionKey(scope));
}
