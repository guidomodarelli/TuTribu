/**
 * Stable categories attached (as the issue message) to every rule of the
 * event input schemas. The route boundary maps the first category to a safe
 * Spanish message, so Zod diagnostics never reach the response.
 */
export const TRIBE_EVENT_INPUT_ISSUE = {
  invalidAttendance: "invalid_attendance",
  invalidCalendarFeed: "invalid_calendar_feed",
  invalidCalendarFeedSubscription: "invalid_calendar_feed_subscription",
  invalidCapacity: "invalid_capacity",
  invalidDate: "invalid_date",
  invalidEventReference: "invalid_event_reference",
  invalidEventType: "invalid_event_type",
  invalidException: "invalid_exception",
  invalidInput: "invalid_input",
  invalidMeetingUrl: "invalid_meeting_url",
  invalidMonth: "invalid_month",
  invalidMove: "invalid_move",
  invalidProposal: "invalid_proposal",
  invalidProposalReference: "invalid_proposal_reference",
  invalidRecurrence: "invalid_recurrence",
  invalidReviewNote: "invalid_review_note",
  invalidTribeReference: "invalid_tribe_reference",
} as const;

export type TribeEventInputIssue =
  (typeof TRIBE_EVENT_INPUT_ISSUE)[keyof typeof TRIBE_EVENT_INPUT_ISSUE];

const TRIBE_EVENT_INPUT_ISSUES: ReadonlySet<string> = new Set(
  Object.values(TRIBE_EVENT_INPUT_ISSUE)
);

/**
 * Narrows an issue message to a known category.
 *
 * @param message - Message of a Zod issue raised by the event schemas.
 * @returns Whether the message is one of the declared categories.
 */
export function isTribeEventInputIssue(message: string): message is TribeEventInputIssue {
  return TRIBE_EVENT_INPUT_ISSUES.has(message);
}
