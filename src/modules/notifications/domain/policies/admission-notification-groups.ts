/** Plans optional-email groups without mutating admission, inbox or provider state. @module admission-notification-groups-policy */
import { ADMISSION_NOTIFICATION_AUDIENCE } from "../../constants/admission-notifications";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_NOTIFICATION_DUPLICATE_OBLIGATION, ADMISSION_NOTIFICATION_EVENT, ADMISSION_NOTIFICATION_GROUP_KEY_NAMESPACE, ADMISSION_NOTIFICATION_GROUP_MANIFEST_FORMAT, ADMISSION_NOTIFICATION_GROUP_REASON, ADMISSION_NOTIFICATION_GROUP_STATUS, ADMISSION_NOTIFICATION_TIMING } from "../../constants/admission-notification-groups";
import { ADMISSION_NOTIFICATION_PREFERENCE_IMPLICIT_VERSION, ADMISSION_NOTIFICATION_PREFERENCE_MODE, ADMISSION_NOTIFICATION_PREFERENCE_STATUS } from "../../constants/admission-notification-preference";
import type { AdmissionNotificationCandidatePlan, AdmissionNotificationEmailFacts, AdmissionNotificationEmailCandidate, AdmissionNotificationGroupIdentity, AdmissionNotificationGroupFreezePlan, AdmissionNotificationRequest, AdmissionNotificationSuppressionReason, AdmissionNotificationWindow } from "../entities/admission-notification";
import type { AdmissionNotificationPreferenceMode } from "../entities/admission-notification-preference";
import { resolveAdmissionNotificationPreference } from "./admission-notification-preference";
import { resolveAdmissionNotificationAudience } from "./admission-notification-audience";

/** @param request - Current original request facts. @param nowMicroseconds - Fresh native clock after all waits. @returns Whether the original pending request crossed three elapsed days and has not expired. */
export function isAdmissionNotificationReminderDue(request: AdmissionNotificationRequest, nowMicroseconds: number): boolean {
  return request.status === ADMISSION_REQUEST_STATUS.pending && nowMicroseconds >= request.submittedAtMicroseconds + ADMISSION_NOTIFICATION_TIMING.reminderAgeMicroseconds && nowMicroseconds < request.expiresAtMicroseconds;
}

/** @param mode - Current effective optional-email frequency. @param nowMicroseconds - Fresh materialization clock, not the source's historical creation time. @param timeZone - Configured tribe zone. @param dailyWindow - Native calendar result for daily mode only. @returns An exact current window or absence; late facts cannot append to a closed bucket. */
export function createAdmissionNotificationWindow(mode: AdmissionNotificationPreferenceMode, nowMicroseconds: number, timeZone: string, dailyWindow: AdmissionNotificationWindow | null): AdmissionNotificationWindow | null {
  if (mode === ADMISSION_NOTIFICATION_PREFERENCE_MODE.omitted) return null;
  if (mode === ADMISSION_NOTIFICATION_PREFERENCE_MODE.daily) return dailyWindow && dailyWindow.timeZone === timeZone && dailyWindow.startsAtMicroseconds <= nowMicroseconds && nowMicroseconds < dailyWindow.closesAtMicroseconds ? { startsAtMicroseconds: dailyWindow.startsAtMicroseconds, closesAtMicroseconds: dailyWindow.closesAtMicroseconds, timeZone } : null;
  if (mode === ADMISSION_NOTIFICATION_PREFERENCE_MODE.individual) return { startsAtMicroseconds: nowMicroseconds, closesAtMicroseconds: nowMicroseconds, timeZone };
  const startsAtMicroseconds = Math.floor(nowMicroseconds / ADMISSION_NOTIFICATION_TIMING.groupedWindowMicroseconds) * ADMISSION_NOTIFICATION_TIMING.groupedWindowMicroseconds;
  return { startsAtMicroseconds, closesAtMicroseconds: startsAtMicroseconds + ADMISSION_NOTIFICATION_TIMING.groupedWindowMicroseconds, timeZone };
}

/** @param identity - Original private grouping scope. @returns Only the fields owned by the group contract, without caller metadata. */
function projectIdentity(identity: AdmissionNotificationGroupIdentity): AdmissionNotificationGroupIdentity {
  return { tribeId: identity.tribeId, recipientUserId: identity.recipientUserId, audience: identity.audience, mode: identity.mode, preferenceVersion: identity.preferenceVersion, emailSettingsVersion: identity.emailSettingsVersion, individualObligationId: identity.individualObligationId, window: { startsAtMicroseconds: identity.window.startsAtMicroseconds, closesAtMicroseconds: identity.window.closesAtMicroseconds, timeZone: identity.window.timeZone } };
}

/** @param identity - Exact recipient/tribe/preference/enablement/calendar bucket. @returns A stable logical identity independent of source order or a provider's deduplication window. */
export function createAdmissionNotificationGroupKey(identity: AdmissionNotificationGroupIdentity): string {
  return JSON.stringify([ADMISSION_NOTIFICATION_GROUP_KEY_NAMESPACE, identity.tribeId, identity.recipientUserId, identity.audience, identity.mode, identity.preferenceVersion, identity.emailSettingsVersion, identity.window.timeZone, identity.window.startsAtMicroseconds, identity.window.closesAtMicroseconds, identity.individualObligationId]);
}

/** @param facts - Fresh native request/recipient/owner facts; no browser role, contact or capability flag may supply them. @param originalIdentity - Original locked group during freeze revalidation; new materialization omits it. @returns A prospective member or suppression; this result never authorizes an external dispatch. */
export function planAdmissionNotificationEmailCandidate(facts: AdmissionNotificationEmailFacts, originalIdentity?: AdmissionNotificationGroupIdentity): AdmissionNotificationCandidatePlan {
  const { source, request, recipient, emailSettings, availability, nowMicroseconds } = facts;
  /** @param reason - Closed private policy outcome. @returns Suppression of optional email only, without changing the source fact. */
  const suppress = (reason: AdmissionNotificationSuppressionReason): AdmissionNotificationCandidatePlan => ({ status: ADMISSION_NOTIFICATION_GROUP_STATUS.suppressed, reason });
  if (source.tribeId !== request.tribeId || source.admissionRequestId !== request.id || source.applicantUserId !== request.applicantUserId || emailSettings.tribeId !== source.tribeId || availability.tribeId !== source.tribeId || availability.recipientUserId !== recipient.userId || recipient.preference && (recipient.preference.tribeId !== source.tribeId || recipient.preference.recipientUserId !== recipient.userId)) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.scopeMismatch);
  const reviewerEvent = resolveAdmissionNotificationAudience(source.event) === ADMISSION_NOTIFICATION_AUDIENCE.reviewer;
  const currentPreference = recipient.audience === ADMISSION_NOTIFICATION_AUDIENCE.reviewer ? resolveAdmissionNotificationPreference({ tribeId: source.tribeId, recipientUserId: recipient.userId, currentRole: recipient.currentRole, membershipStatus: recipient.membershipStatus }, null) : null;
  if (recipient.audience === ADMISSION_NOTIFICATION_AUDIENCE.reviewer ? !reviewerEvent || currentPreference?.status !== ADMISSION_NOTIFICATION_PREFERENCE_STATUS.resolved : reviewerEvent || recipient.userId !== source.applicantUserId) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.recipientUnauthorized);
  if (reviewerEvent ? request.status !== ADMISSION_REQUEST_STATUS.pending || nowMicroseconds >= request.expiresAtMicroseconds || source.event === ADMISSION_NOTIFICATION_EVENT.reminder && !isAdmissionNotificationReminderDue(request, nowMicroseconds) : request.status !== source.event) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.eventNotCurrent);
  if (!emailSettings.enabled || emailSettings.enabledAtMicroseconds === null) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.emailDisabled);
  if (source.createdAtMicroseconds < emailSettings.enabledAtMicroseconds) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.eventPredatesEmail);
  if (!availability.trustedAccountEmailAvailable) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.emailUntrusted);
  if (!availability.preparedEmailConnectionAvailable) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.capabilityUnavailable);
  const mode = recipient.audience === ADMISSION_NOTIFICATION_AUDIENCE.applicant ? ADMISSION_NOTIFICATION_PREFERENCE_MODE.individual : recipient.preference?.mode ?? (currentPreference?.status === ADMISSION_NOTIFICATION_PREFERENCE_STATUS.resolved ? currentPreference.preference.mode : ADMISSION_NOTIFICATION_PREFERENCE_MODE.omitted);
  if (mode === ADMISSION_NOTIFICATION_PREFERENCE_MODE.omitted) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.preferenceOmitted);
  if (recipient.audience === ADMISSION_NOTIFICATION_AUDIENCE.reviewer && recipient.preference && source.createdAtMicroseconds < recipient.preference.effectiveFromMicroseconds) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.eventPredatesPreference);
  const deadlineAtMicroseconds = source.createdAtMicroseconds + ADMISSION_NOTIFICATION_TIMING.retryLimitMicroseconds;
  if (nowMicroseconds >= deadlineAtMicroseconds) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.deadlineExpired);
  const window = originalIdentity?.window ?? createAdmissionNotificationWindow(mode, mode === ADMISSION_NOTIFICATION_PREFERENCE_MODE.individual ? source.createdAtMicroseconds : nowMicroseconds, emailSettings.timeZone, facts.dailyWindow);
  if (!window) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.windowUnavailable);
  if (window.closesAtMicroseconds >= deadlineAtMicroseconds) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.deadlineBeforeWindow);
  const identity: AdmissionNotificationGroupIdentity = { tribeId: source.tribeId, recipientUserId: recipient.userId, audience: recipient.audience, mode, preferenceVersion: recipient.audience === ADMISSION_NOTIFICATION_AUDIENCE.reviewer ? recipient.preference?.version ?? ADMISSION_NOTIFICATION_PREFERENCE_IMPLICIT_VERSION : ADMISSION_NOTIFICATION_PREFERENCE_IMPLICIT_VERSION, emailSettingsVersion: emailSettings.version, window: { startsAtMicroseconds: window.startsAtMicroseconds, closesAtMicroseconds: window.closesAtMicroseconds, timeZone: emailSettings.timeZone }, individualObligationId: mode === ADMISSION_NOTIFICATION_PREFERENCE_MODE.individual ? source.id : null };
  if (originalIdentity && createAdmissionNotificationGroupKey(identity) !== createAdmissionNotificationGroupKey(originalIdentity)) return suppress(ADMISSION_NOTIFICATION_GROUP_REASON.scopeMismatch);
  return { status: ADMISSION_NOTIFICATION_GROUP_STATUS.candidate, candidate: { obligationId: source.id, admissionRequestId: source.admissionRequestId, event: source.event, createdAtMicroseconds: source.createdAtMicroseconds, deadlineAtMicroseconds, identity } };
}

/** @param identity - Exact original group scope. @param candidates - Members reevaluated from current locked facts immediately before freezing. @param nowMicroseconds - Fresh native clock after waits. @returns A minimal ordered immutable manifest or explicit deferred/expired/rejected units; no provider payload or send permission is created. */
export function freezeAdmissionNotificationGroup(identity: AdmissionNotificationGroupIdentity, candidates: readonly AdmissionNotificationEmailCandidate[], nowMicroseconds: number): AdmissionNotificationGroupFreezePlan {
  if (nowMicroseconds < identity.window.closesAtMicroseconds) return { status: ADMISSION_NOTIFICATION_GROUP_STATUS.notDue };
  if (candidates.length === 0) return { status: ADMISSION_NOTIFICATION_GROUP_STATUS.empty };
  const groupKey = createAdmissionNotificationGroupKey(identity), seen = new Set<string>();
  for (const candidate of candidates) {
    if (createAdmissionNotificationGroupKey(candidate.identity) !== groupKey) return { status: ADMISSION_NOTIFICATION_GROUP_STATUS.rejected, reason: ADMISSION_NOTIFICATION_GROUP_REASON.scopeMismatch };
    if (seen.has(candidate.obligationId)) return { status: ADMISSION_NOTIFICATION_GROUP_STATUS.rejected, reason: ADMISSION_NOTIFICATION_DUPLICATE_OBLIGATION };
    seen.add(candidate.obligationId);
  }
  const expiredObligationIds = candidates.filter((candidate) => nowMicroseconds >= candidate.deadlineAtMicroseconds).map((candidate) => candidate.obligationId).sort();
  const live = candidates.filter((candidate) => nowMicroseconds < candidate.deadlineAtMicroseconds).toSorted((first, second) => first.obligationId < second.obligationId ? -1 : 1);
  if (live.length === 0) return { status: ADMISSION_NOTIFICATION_GROUP_STATUS.expired, expiredObligationIds };
  return { status: ADMISSION_NOTIFICATION_GROUP_STATUS.frozen, deadlineAtMicroseconds: live.reduce((earliest, candidate) => Math.min(earliest, candidate.deadlineAtMicroseconds), live[0].deadlineAtMicroseconds), expiredObligationIds, manifest: { format: ADMISSION_NOTIFICATION_GROUP_MANIFEST_FORMAT, identity: projectIdentity(identity), items: live.map((candidate) => ({ obligationId: candidate.obligationId, admissionRequestId: candidate.admissionRequestId, event: candidate.event, createdAtMicroseconds: candidate.createdAtMicroseconds, deadlineAtMicroseconds: candidate.deadlineAtMicroseconds })) } };
}
