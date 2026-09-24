import { z } from "zod";

import type {
  TribeEventAttendanceReportResult,
  TribeEventAttendanceStreakResult,
  TribeEventAttendanceSummaryResult,
  TribeEventListResult,
  TribeEventOccurrenceResult,
  TribeEventProposalListResult,
  TribeEventProposalResult,
  TribeEventResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import { parseMonth } from "@/src/modules/events/application/services/buenos-aires-month";
import {
  TRIBE_EVENT_ATTENDANCE_FAILURE_CODE,
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
 * Safe Spanish message: the body of `DELETE` events and of most failures.
 */
export const tribeEventMessageResponseSchema = z.object({
  message: z.string(),
});

/**
 * Body of a failed request: the safe Spanish message plus, for attendance
 * answers the server refused because the occurrence already ended, the stable
 * `occurrence_ended` code the UI uses to close the answers even when its own
 * clock lags behind.
 */
export const tribeEventFailureResponseSchema = tribeEventMessageResponseSchema.extend({
  code: z.enum(TRIBE_EVENT_ATTENDANCE_FAILURE_CODE).optional(),
});

/**
 * Allowlisted streak counts: non-negative integers only.
 */
export const tribeEventAttendanceStreakCountsSchema = z.object({
  attendedCount: nonNegativeCountSchema,
  occurrenceCount: nonNegativeCountSchema,
}) satisfies z.ZodType<TribeEventAttendanceStreakResult>;

/**
 * Viewer streak passed as a prop to the events calendar (null: hidden).
 */
export const tribeEventAttendanceStreakSchema =
  tribeEventAttendanceStreakCountsSchema.nullable() satisfies z.ZodType<TribeEventAttendanceStreakResult | null>;

/**
 * Next instant at which the streak can change: the nearest end of a running
 * or upcoming occurrence of the tribe. `null` means nothing ends inside the
 * upcoming window.
 */
export const tribeEventAttendanceStreakNextRefreshAtSchema = instantSchema.nullable();

/**
 * Database instant at which the server computed the streak and its next
 * refresh. The events page, the streak route, and the series mutations send
 * it next to the streak so the client can tell whether an occurrence finished
 * between that snapshot and its own clock value.
 */
export const tribeEventAttendanceStreakComputedAtSchema = instantSchema;

/**
 * `GET /events/attendance-streak` body. `null` means the viewer has no streak.
 * The route always sends both instants (they come from one snapshot read);
 * they stay optional so a body without them keeps what the client already
 * watches, and the client treats that read as partial and retries it.
 */
export const tribeEventAttendanceStreakResponseSchema = z.object({
  attendanceStreak: tribeEventAttendanceStreakSchema,
  attendanceStreakComputedAt: tribeEventAttendanceStreakComputedAtSchema.optional(),
  attendanceStreakNextRefreshAt: tribeEventAttendanceStreakNextRefreshAtSchema.optional(),
});

/**
 * Streak snapshot the events page passes as props to the calendar: the
 * streak (null: hidden), the database instant it was computed at, and the
 * next instant at which it can change (null: nothing ends soon).
 */
export const tribeEventAttendanceStreakPropsSchema = z.object({
  attendanceStreak: tribeEventAttendanceStreakSchema,
  attendanceStreakComputedAt: tribeEventAttendanceStreakComputedAtSchema,
  attendanceStreakNextRefreshAt: tribeEventAttendanceStreakNextRefreshAtSchema,
});

/**
 * Streak fragment the series mutations (POST, PATCH, and DELETE of an event)
 * spread into their body. Each field is validated on its own, so the route
 * logs and omits only the field that breaks this contract; the client then
 * applies neither field and reads the streak again once every pending
 * mutation settles.
 */
export const tribeEventAttendanceStreakMutationFragmentSchema = z.object({
  attendanceStreak: tribeEventAttendanceStreakSchema.optional(),
  attendanceStreakComputedAt: tribeEventAttendanceStreakComputedAtSchema.optional(),
  attendanceStreakNextRefreshAt: tribeEventAttendanceStreakNextRefreshAtSchema.optional(),
});

/**
 * The same fragment as read inside a mutation body: absent means "could not
 * be recomputed", and an unusable value is dropped to absent instead of
 * failing the whole mutation body, which already succeeded.
 */
const tribeEventAttendanceStreakRefreshShape = {
  attendanceStreak: tribeEventAttendanceStreakSchema.optional().catch(undefined),
  attendanceStreakComputedAt: tribeEventAttendanceStreakComputedAtSchema
    .optional()
    .catch(undefined),
  attendanceStreakNextRefreshAt: tribeEventAttendanceStreakNextRefreshAtSchema
    .optional()
    .catch(undefined),
};

/**
 * `POST /events` and `PATCH /events/[eventId]` body.
 */
export const tribeEventSaveResponseSchema = z.object({
  ...tribeEventAttendanceStreakRefreshShape,
  event: tribeEventSchema,
  message: z.string(),
  occurrences: z.array(tribeEventOccurrenceSchema),
});

/**
 * `DELETE /events/[eventId]` body: the safe message plus the streak refresh.
 */
export const tribeEventDeleteResponseSchema = tribeEventMessageResponseSchema.extend(
  tribeEventAttendanceStreakRefreshShape
);

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
  originalOccurrenceStartsAt: instantSchema,
  trend: z.array(
    z.object({
      goingCount: nonNegativeCountSchema,
      occurrenceStartsAt: instantSchema,
      originalOccurrenceStartsAt: instantSchema,
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
  pendingCount: nonNegativeCountSchema,
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
export type TribeEventFailureResponse = z.infer<typeof tribeEventFailureResponseSchema>;
export type TribeEventAttendanceStreakMutationFragment = z.infer<
  typeof tribeEventAttendanceStreakMutationFragmentSchema
>;
export type TribeEventSaveResponse = z.infer<typeof tribeEventSaveResponseSchema>;
export type TribeEventDeleteResponse = z.infer<typeof tribeEventDeleteResponseSchema>;
export type TribeEventAttendanceStreakResponse = z.infer<
  typeof tribeEventAttendanceStreakResponseSchema
>;
export type TribeEventAttendanceResponse = z.infer<typeof tribeEventAttendanceResponseSchema>;
export type TribeEventAttendanceReportResponse = z.infer<
  typeof tribeEventAttendanceReportResponseSchema
>;
