/** Resolves role defaults and plans versioned choices without enabling or dispatching email. @module admission-notification-preference-policy */
import {
  ADMISSION_NOTIFICATION_PREFERENCE_IMPLICIT_VERSION,
  ADMISSION_NOTIFICATION_PREFERENCE_MODE,
  ADMISSION_NOTIFICATION_PREFERENCE_REJECTION,
  ADMISSION_NOTIFICATION_PREFERENCE_SOURCE,
  ADMISSION_NOTIFICATION_PREFERENCE_STATUS,
} from "../../constants/admission-notification-preference";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type {
  AdmissionNotificationPreference,
  AdmissionNotificationPreferenceChange,
  AdmissionNotificationPreferenceChangePlan,
  AdmissionNotificationPreferenceContext,
  AdmissionNotificationPreferenceResolution,
} from "../entities/admission-notification-preference";

/** @param preference - Original scoped private record. @returns Only the owned fields, without carrying adapter metadata into another boundary. */
function projectStoredPreference(preference: AdmissionNotificationPreference): AdmissionNotificationPreference {
  return {
    tribeId: preference.tribeId,
    recipientUserId: preference.recipientUserId,
    mode: preference.mode,
    version: preference.version,
    effectiveFrom: preference.effectiveFrom,
  };
}

/**
 * Resolves current active reviewers before returning explicit choices or read-only role defaults.
 * @param context - Current account, tribe and role facts owned by the server.
 * @param storedPreference - Existing own preference, or null when it has never been saved.
 * @returns A closed rejection or a projection independent of provider/check/channel availability.
 */
export function resolveAdmissionNotificationPreference(context: AdmissionNotificationPreferenceContext, storedPreference: AdmissionNotificationPreference | null): AdmissionNotificationPreferenceResolution {
  if (context.membershipStatus !== TRIBE_MEMBERSHIP_STATUS.active || context.currentRole !== TRIBE_MEMBER_ROLE.leader && context.currentRole !== TRIBE_MEMBER_ROLE.guardian) {
    return { status: ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected, reason: ADMISSION_NOTIFICATION_PREFERENCE_REJECTION.reviewerRequired };
  }
  if (storedPreference && (storedPreference.tribeId !== context.tribeId || storedPreference.recipientUserId !== context.recipientUserId)) {
    return { status: ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected, reason: ADMISSION_NOTIFICATION_PREFERENCE_REJECTION.scopeMismatch };
  }
  if (storedPreference) return { status: ADMISSION_NOTIFICATION_PREFERENCE_STATUS.resolved, preference: { ...projectStoredPreference(storedPreference), source: ADMISSION_NOTIFICATION_PREFERENCE_SOURCE.stored } };
  return {
    status: ADMISSION_NOTIFICATION_PREFERENCE_STATUS.resolved,
    preference: {
      tribeId: context.tribeId,
      recipientUserId: context.recipientUserId,
      mode: context.currentRole === TRIBE_MEMBER_ROLE.leader ? ADMISSION_NOTIFICATION_PREFERENCE_MODE.grouped : ADMISSION_NOTIFICATION_PREFERENCE_MODE.omitted,
      version: ADMISSION_NOTIFICATION_PREFERENCE_IMPLICIT_VERSION,
      effectiveFrom: null,
      source: ADMISSION_NOTIFICATION_PREFERENCE_SOURCE.implicit,
    },
  };
}

/**
 * Plans an explicit choice with CAS while preserving a true no-op's original delivery epoch.
 * @param context - Fresh server-owned reviewer facts; the application must recheck them under its write locks.
 * @param storedPreference - Current scoped preference, or null for the original implicit default.
 * @param change - Requested mode and originally observed version, validated once at the public input boundary.
 * @param effectiveFrom - Authoritative database timestamp text, retained at its original precision and never taken from browser input.
 * @returns A new record, an unchanged original or a closed rejection; the caller persists the plan atomically.
 */
export function planAdmissionNotificationPreferenceChange(context: AdmissionNotificationPreferenceContext, storedPreference: AdmissionNotificationPreference | null, change: AdmissionNotificationPreferenceChange, effectiveFrom: string): AdmissionNotificationPreferenceChangePlan {
  const currentPreference = resolveAdmissionNotificationPreference(context, storedPreference);
  if (currentPreference.status === ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected) return currentPreference;
  if (change.expectedVersion !== currentPreference.preference.version) return { status: ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected, reason: ADMISSION_NOTIFICATION_PREFERENCE_REJECTION.versionConflict };
  if (storedPreference && storedPreference.mode === change.mode) return { status: ADMISSION_NOTIFICATION_PREFERENCE_STATUS.unchanged, preference: projectStoredPreference(storedPreference) };
  return {
    status: ADMISSION_NOTIFICATION_PREFERENCE_STATUS.changed,
    preference: {
      tribeId: context.tribeId,
      recipientUserId: context.recipientUserId,
      mode: change.mode,
      version: currentPreference.preference.version + 1,
      effectiveFrom,
    },
  };
}
