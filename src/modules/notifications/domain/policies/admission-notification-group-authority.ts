/** Revalidates every frozen member while preserving the original manifest and earliest native deadline. @module admission-notification-group-authority-policy */
import { ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT, ADMISSION_NOTIFICATION_GROUP_AUTHORITY_DENIED, ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON } from "../../constants/admission-notification-group-authority";
import { ADMISSION_NOTIFICATION_GROUP_STATE } from "../../constants/admission-notification-group-storage";
import { ADMISSION_NOTIFICATION_GROUP_STATUS, ADMISSION_NOTIFICATION_GROUP_REASON } from "../../constants/admission-notification-groups";
import type { AdmissionNotificationGroupManifest } from "../entities/admission-notification";
import type { AdmissionNotificationStoredGroup } from "../entities/admission-notification-group";
import type { AdmissionNotificationGroupAuthorityMember, AdmissionNotificationGroupAuthorityPlan, AdmissionNotificationGroupAuthorityReason, AdmissionNotificationGroupAuthorityScope } from "../entities/admission-notification-group-authority";
import { createAdmissionNotificationGroupKey, freezeAdmissionNotificationGroup } from "./admission-notification-groups";

/** @param first - Original complete reference manifest. @param second - Independently projected native facts or authenticated frozen intent. @returns Exact identity/member/lifetime equality, independent of jsonb object-key ordering. */
export function admissionNotificationManifestsMatch(first: AdmissionNotificationGroupManifest, second: AdmissionNotificationGroupManifest): boolean {
  return (first.format as number) === second.format && createAdmissionNotificationGroupKey(first.identity) === createAdmissionNotificationGroupKey(second.identity) && first.items.length === second.items.length && first.items.every((item, index) => {
    const other = second.items[index];
    return item.obligationId === other.obligationId && item.admissionRequestId === other.admissionRequestId && item.event === other.event && item.createdAtMicroseconds === other.createdAtMicroseconds && item.deadlineAtMicroseconds === other.deadlineAtMicroseconds;
  });
}

/**
 * Evaluates the entire original group, never just its first remaining source.
 * @param scope - Exact provenance read from the original private outbox.
 * @param group - Current locked native group, or genuine absence after lifecycle retirement.
 * @param members - Every original member reevaluated against current request, recipient, preference and capability facts.
 * @param nowMicroseconds - Fresh native time after all potentially waiting locks.
 * @returns Current complete references or one closed denial; no content is rewritten and no transport is authorized here.
 */
export function resolveAdmissionNotificationGroupAuthority(scope: AdmissionNotificationGroupAuthorityScope, group: AdmissionNotificationStoredGroup | null, members: readonly AdmissionNotificationGroupAuthorityMember[], nowMicroseconds: number): AdmissionNotificationGroupAuthorityPlan {
  const deny = (reason: AdmissionNotificationGroupAuthorityReason): AdmissionNotificationGroupAuthorityPlan => ({ status: ADMISSION_NOTIFICATION_GROUP_AUTHORITY_DENIED, reason });
  if (!group) return deny(ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON.unavailable);
  if (group.id !== scope.groupId || group.identity.tribeId !== scope.tribeId || group.identity.recipientUserId !== scope.recipientUserId || group.identity.audience !== scope.audience) return deny(ADMISSION_NOTIFICATION_GROUP_REASON.scopeMismatch);
  if (group.state !== ADMISSION_NOTIFICATION_GROUP_STATE.frozen || !group.frozenManifest || group.deadlineAtMicroseconds === null) return deny(ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON.notFrozen);
  if (nowMicroseconds >= group.deadlineAtMicroseconds) return deny(ADMISSION_NOTIFICATION_GROUP_REASON.deadlineExpired);
  const candidates = [];
  for (const member of members) {
    if (member.plan.status !== ADMISSION_NOTIFICATION_GROUP_STATUS.candidate) return deny(member.plan.reason);
    if (member.obligationId !== member.plan.candidate.obligationId) return deny(ADMISSION_NOTIFICATION_GROUP_REASON.scopeMismatch);
    candidates.push(member.plan.candidate);
  }
  const current = freezeAdmissionNotificationGroup(group.identity, candidates, nowMicroseconds);
  if (current.status !== ADMISSION_NOTIFICATION_GROUP_STATUS.frozen || current.expiredObligationIds.length || current.deadlineAtMicroseconds !== group.deadlineAtMicroseconds || !admissionNotificationManifestsMatch(group.frozenManifest, current.manifest)) return deny(ADMISSION_NOTIFICATION_GROUP_AUTHORITY_REASON.manifestChanged);
  return { status: ADMISSION_NOTIFICATION_GROUP_AUTHORITY_CURRENT, manifest: current.manifest, deadlineAtMicroseconds: current.deadlineAtMicroseconds };
}
