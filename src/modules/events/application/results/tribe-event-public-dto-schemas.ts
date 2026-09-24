import { z } from "zod";

import type {
  TribeEventAttendanceReportResult,
  TribeEventAttendanceStreakResult,
  TribeEventAttendanceSummaryResult,
  TribeEventCalendarFeedSubscriptionResult,
  TribeEventListResult,
  TribeEventOccurrenceResult,
  TribeEventProposalListResult,
  TribeEventProposalResult,
  TribeEventResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { parseMonth } from "@/src/modules/events/application/services/buenos-aires-month";
import {
  TRIBE_EVENT_ATTENDANCE_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_PROPOSAL_STATUS,
  TRIBE_EVENT_RECURRENCE_FREQUENCY,
  TRIBE_EVENT_TYPE,
} from "@/src/modules/events/constants/tribe-events";

/**
 * Runtime contracts of the public DTOs the events middleend hands to the
 * browser: JSON bodies of `app/api/tribes/[slug]/events/**` and the props the
 * events page passes to its client components.
 *
 * They live next to the result types because they describe the same UI
 * contract; being plain Zod (no I/O, framework, or provider), the route
 * handlers, the page, and the browser adapter can all import them without
 * breaking the dependency rule. `z.object` strips unknown keys, so a parsed
 * DTO is also the allowlist of what leaves the server. Each schema is checked
 * against its result type at compile time (`satisfies z.ZodType<...>`).
 */

const nonNegativeCountSchema = z.int().nonnegative();
const instantSchema = z.iso.datetime({ offset: true });
const monthKeySchema = z.string().refine((month) => parseMonth(month) !== null);

const recurrenceFrequencySchema = z.enum(TRIBE_EVENT_RECURRENCE_FREQUENCY);
const attendanceStatusSchema = z.enum(TRIBE_EVENT_ATTENDANCE_STATUS);
const eventTypeSchema = z.enum(TRIBE_EVENT_TYPE);

const occurrenceExceptionSchema = z.object({
  kind: z.enum(TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND),
  reason: z.string().nullable(),
});

const attendeePreviewSchema = z.object({
  id: z.string(),
  image: z.string().nullable(),
  name: z.string(),
});

export const tribeEventAttendanceSummarySchema = z.object({
  goingCount: nonNegativeCountSchema,
  goingPreview: z.array(attendeePreviewSchema),
  maybeCount: nonNegativeCountSchema,
  viewerStatus: attendanceStatusSchema.nullable(),
  viewerWaitlistPosition: z.int().positive().nullable(),
  waitlistedCount: nonNegativeCountSchema,
}) satisfies z.ZodType<TribeEventAttendanceSummaryResult>;

export const tribeEventOccurrenceSchema = z.object({
  attendance: tribeEventAttendanceSummarySchema,
  capacity: z.int().positive().nullable(),
  description: z.string().nullable(),
  endsAt: instantSchema.nullable(),
  eventId: z.string(),
  eventType: eventTypeSchema,
  exception: occurrenceExceptionSchema.nullable(),
  meetingUrl: z.string().nullable(),
  occurrenceKey: z.string(),
  originalStartsAt: instantSchema,
  recurrenceFrequency: recurrenceFrequencySchema,
  recurrenceRule: z.string().nullable(),
  recurrenceUntil: instantSchema.nullable(),
  seriesEndsAt: instantSchema.nullable(),
  seriesStartsAt: instantSchema,
  startsAt: instantSchema,
  title: z.string(),
}) satisfies z.ZodType<TribeEventOccurrenceResult>;

export const tribeEventSchema = z.object({
  capacity: z.int().positive().nullable(),
  description: z.string().nullable(),
  endsAt: instantSchema.nullable(),
  eventType: eventTypeSchema,
  id: z.string(),
  meetingUrl: z.string().nullable(),
  recurrenceFrequency: recurrenceFrequencySchema,
  recurrenceRule: z.string().nullable(),
  recurrenceUntil: instantSchema.nullable(),
  startsAt: instantSchema,
  title: z.string(),
}) satisfies z.ZodType<TribeEventResult>;

/**
 * `GET /events` body; also the listing the events page renders.
 */
export const tribeEventListResponseSchema = z.object({
  events: z.array(tribeEventOccurrenceSchema),
  month: z.object({
    current: monthKeySchema,
    next: monthKeySchema,
    previous: monthKeySchema,
  }),
  pendingProposalCount: nonNegativeCountSchema,
  selectedOccurrenceKey: z.string().nullable(),
  viewerPermissions: z.object({
    canManageEvents: z.boolean(),
    canProposeEvents: z.boolean(),
  }),
}) satisfies z.ZodType<TribeEventListResult>;

/**
 * Safe Spanish message: the whole body of failures and of `DELETE` events.
 */
export const tribeEventMessageResponseSchema = z.object({
  message: z.string(),
});

/**
 * `POST /events` and `PATCH /events/[eventId]` body.
 */
export const tribeEventSaveResponseSchema = z.object({
  event: tribeEventSchema,
  message: z.string(),
  occurrences: z.array(tribeEventOccurrenceSchema),
});

/**
 * `PUT` and `DELETE /attendance` body: the fresh summary of the occurrence.
 */
export const tribeEventAttendanceResponseSchema = z.object({
  attendance: tribeEventAttendanceSummarySchema,
  message: z.string(),
});

const attendeeSchema = z.object({
  name: z.string(),
  respondedAt: instantSchema,
  status: attendanceStatusSchema,
});

export const tribeEventAttendanceReportSchema = z.object({
  attendeeGroups: z.object({
    going: z.array(attendeeSchema),
    maybe: z.array(attendeeSchema),
    notGoing: z.array(attendeeSchema),
    waitlisted: z.array(attendeeSchema),
  }),
  eventTitle: z.string(),
  occurrenceStartsAt: instantSchema,
  trend: z.array(
    z.object({
      goingCount: nonNegativeCountSchema,
      occurrenceStartsAt: instantSchema,
    })
  ),
}) satisfies z.ZodType<TribeEventAttendanceReportResult>;

/**
 * `GET /attendance?occurrence=` body (managers only).
 */
export const tribeEventAttendanceReportResponseSchema = z.object({
  report: tribeEventAttendanceReportSchema,
});

/**
 * Viewer streak passed as a prop to the events calendar (null: hidden).
 */
export const tribeEventAttendanceStreakSchema = z
  .object({
    attendedCount: nonNegativeCountSchema,
    occurrenceCount: nonNegativeCountSchema,
  })
  .nullable() satisfies z.ZodType<TribeEventAttendanceStreakResult | null>;

/**
 * `PUT` and `DELETE /exceptions` body: the series slots of the visible month
 * after cancelling, moving, or restoring one date.
 */
export const tribeEventExceptionResponseSchema = z.object({
  message: z.string(),
  occurrences: z.array(tribeEventOccurrenceSchema),
});

export const tribeEventProposalSchema = z.object({
  createdAt: instantSchema,
  description: z.string().nullable(),
  durationMinutes: z.int().positive(),
  eventId: z.string().nullable(),
  eventType: eventTypeSchema,
  id: z.string(),
  proposerName: z.string().nullable(),
  reviewNote: z.string().nullable(),
  reviewedAt: instantSchema.nullable(),
  startsAt: instantSchema,
  status: z.enum(TRIBE_EVENT_PROPOSAL_STATUS),
  title: z.string(),
}) satisfies z.ZodType<TribeEventProposalResult>;

/**
 * `GET /events/proposals` body.
 */
export const tribeEventProposalListResponseSchema = z.object({
  canReviewProposals: z.boolean(),
  proposals: z.array(tribeEventProposalSchema),
}) satisfies z.ZodType<TribeEventProposalListResult>;

/**
 * `POST /events/proposals` and `PATCH /events/proposals/[proposalId]` body.
 */
export const tribeEventProposalResponseSchema = z.object({
  message: z.string(),
  proposal: tribeEventProposalSchema,
});

/**
 * `POST /events/proposals/[proposalId]/approval` body: the created event,
 * its slots in the visible month, and the resolved proposal.
 */
export const tribeEventProposalApprovalResponseSchema = z.object({
  event: tribeEventSchema,
  message: z.string(),
  occurrences: z.array(tribeEventOccurrenceSchema),
  proposal: tribeEventProposalSchema,
});

export type TribeEventMessageResponse = z.infer<typeof tribeEventMessageResponseSchema>;
export type TribeEventSaveResponse = z.infer<typeof tribeEventSaveResponseSchema>;
export type TribeEventAttendanceResponse = z.infer<typeof tribeEventAttendanceResponseSchema>;
export type TribeEventAttendanceReportResponse = z.infer<
  typeof tribeEventAttendanceReportResponseSchema
>;

/**
 * URL protocols of the personal feed link: https everywhere, http only when
 * the public base URL is a local development host.
 */
const FEED_URL_PROTOCOL_PATTERN = /^https?$/;

export const tribeEventCalendarFeedSubscriptionSchema = z.object({
  createdAt: instantSchema,
  lastUsedAt: instantSchema.nullable(),
}) satisfies z.ZodType<TribeEventCalendarFeedSubscriptionResult>;

/**
 * `GET .../events/calendar-feed`: whether the member has an active link
 * (never the token or its hash).
 */
export const tribeEventCalendarFeedStatusResponseSchema = z.object({
  subscription: tribeEventCalendarFeedSubscriptionSchema.nullable(),
});

/**
 * `POST .../events/calendar-feed`: the personal https feed URL, shown once.
 */
export const tribeEventCalendarFeedIssueResponseSchema = z.object({
  feedUrl: z.url({ protocol: FEED_URL_PROTOCOL_PATTERN }),
  message: z.string(),
  subscription: tribeEventCalendarFeedSubscriptionSchema,
});

/**
 * `DELETE .../events/calendar-feed`: the subscription is off.
 */
export const tribeEventCalendarFeedRevokeResponseSchema = z.object({
  message: z.string(),
  subscription: z.null(),
});

export type TribeEventCalendarFeedStatusResponse = z.infer<
  typeof tribeEventCalendarFeedStatusResponseSchema
>;
export type TribeEventCalendarFeedIssueResponse = z.infer<
  typeof tribeEventCalendarFeedIssueResponseSchema
>;
