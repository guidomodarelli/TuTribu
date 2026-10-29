import { tribeEventAttendanceStreakResponseSchema } from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import {
  tribeEventEmptyQuerySchema,
  tribeEventsRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import {
  handleTribeEventRoute,
  openTribeEventScope,
  type TribeEventsRouteContext,
} from "../tribe-event-route";

const ATTENDANCE_STREAK_ROUTE_LOG = {
  failureMessage: "Tribe event attendance streak lookup failed",
  failureReason: "unexpected_event_repository_error",
  operation: "read-tribe-event-attendance-streak",
} as const;

/**
 * Lightweight read of the viewer attendance streak. The events calendar asks
 * for it once when an occurrence on screen finishes, because that occurrence
 * now belongs to the last-five window and can change the streak. The body
 * also carries the next instant at which the streak can change again, so the
 * calendar keeps scheduling refreshes for occurrences outside the visible month.
 */
export async function GET(request: Request, context: TribeEventsRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        extraMetadata: { reason: ATTENDANCE_STREAK_ROUTE_LOG.failureReason },
        logMessage: ATTENDANCE_STREAK_ROUTE_LOG.failureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceStreakMessage,
      },
      openScope: openTribeEventScope(ATTENDANCE_STREAK_ROUTE_LOG.operation),
      schemas: {
        params: tribeEventsRouteParamsSchema,
        query: tribeEventEmptyQuerySchema,
      },
    },
    // The streak and its next refresh come from one read (a single database
    // snapshot) at one reference instant, the database clock of that read, so a
    // schedule change committed while the route runs can never show up in one
    // value and not in the other. `new Date()` only sizes the read ranges.
    async ({ modules, params, respond }) => {
      const { attendanceStreak, computedAt, nextRefreshAt } =
        await modules.events.useCases.getTribeEventAttendanceStreakSnapshot({
          now: new Date(),
          tribeSlug: params.slug,
        });

      return respond(
        {
          attendanceStreak,
          attendanceStreakComputedAt: computedAt,
          attendanceStreakNextRefreshAt: nextRefreshAt,
        },
        tribeEventAttendanceStreakResponseSchema,
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }
  );
}
