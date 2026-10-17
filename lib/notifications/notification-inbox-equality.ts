/** Compares the owned display contract without JSON key-order assumptions or provider payloads. @module notification-inbox-equality */
import type { NotificationItemResult } from "@/src/modules/notifications/application/results/notification-result";

/** @param current - Existing public display item. @param next - Newly parsed public item. @returns Equality of every rendered subject and link field, including content edits without a new notice identity. */
function sameNotification(current: NotificationItemResult, next: NotificationItemResult): boolean {
  if (current.id !== next.id || current.type !== next.type || current.createdAt !== next.createdAt || current.readAt !== next.readAt || current.tribe.name !== next.tribe.name || current.tribe.slug !== next.tribe.slug) return false;
  if ("admission" in current && "admission" in next) return current.admission.requestId === next.admission.requestId && current.admission.audience === next.admission.audience;
  if ("event" in current && "event" in next) return current.event.eventId === next.event.eventId && current.event.eventTitle === next.event.eventTitle && current.event.occurrenceStartsAt === next.event.occurrenceStartsAt && current.event.startsAt === next.event.startsAt;
  if ("proposal" in current && "proposal" in next) return current.proposal.proposalId === next.proposal.proposalId && current.proposal.proposalTitle === next.proposal.proposalTitle && current.proposal.decision === next.proposal.decision && current.proposal.eventId === next.proposal.eventId && current.proposal.eventStartsAt === next.proposal.eventStartsAt && current.proposal.reviewNote === next.proposal.reviewNote;
  return false;
}

/** @param current - Existing ordered inbox rows. @param next - Current ordered own snapshot. @returns Whether React can safely retain the existing array and its row identities. */
export function sameNotificationInboxRows(current: readonly NotificationItemResult[], next: readonly NotificationItemResult[]): boolean { return current.length === next.length && current.every((notice, index) => sameNotification(notice, next[index])); }
