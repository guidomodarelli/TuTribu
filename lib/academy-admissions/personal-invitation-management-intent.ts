"use client";
/** Persists only viewer-scoped original references, never draft, URL, recipient or consent. @module personal-invitation-management-intent-storage */
import type { PersonalInvitationManagementReference } from "@/src/modules/academy-admissions/application/commands/personal-invitation-management-intent";
import { buildScopedIntentKey, readScopedIntentRecord, type ScopedIntentStorage } from "@/lib/scoped-intent-storage";
import { PERSONAL_INVITATION_MANAGEMENT_STORAGE_PREFIX, personalInvitationManagementStoredSchema } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";

type StoragePort = ScopedIntentStorage;
/** @param viewerId - Native initial account. @param slug - Native tribe. @returns Only the local reference key, without secret navigation or contact. */
const key = (viewerId: string, slug: string) => buildScopedIntentKey(PERSONAL_INVITATION_MANAGEMENT_STORAGE_PREFIX, viewerId, slug);
/** @param viewerId - Native current account. @param slug - Native current tribe. @param storage - Own browser edge. @returns Valid original progress or absence; corrupted records are removed. */
export function readPersonalInvitationManagementReference(viewerId: string, slug: string, storage: StoragePort = window.sessionStorage): PersonalInvitationManagementReference | null {
  const stored = readScopedIntentRecord(personalInvitationManagementStoredSchema, { viewerId, slug }, key(viewerId, slug), storage);
  return stored ? stored.pending : null;
}
/** @param viewerId - Native initial account. @param slug - Native tribe. @param pending - Original progress only. @param storage - Own browser edge. @returns After durable write; failure prevents dispatch. */
export function writePersonalInvitationManagementReference(viewerId: string, slug: string, pending: PersonalInvitationManagementReference | null, storage: StoragePort = window.sessionStorage): void {
  storage.setItem(key(viewerId, slug), JSON.stringify(personalInvitationManagementStoredSchema.parse({ viewerId, slug, pending })));
}
