import { tribeEventAttendanceStreakResponseDtoSchema } from "@/src/modules/events/infrastructure/api/dto/tribe-event-attendance-streak-dto";
import { tribeEventAttendanceStreakRouteParamsSchema } from "@/src/modules/events/infrastructure/api/tribe-event-attendance-streak-route-params";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const ATTENDANCE_STREAK_ROUTE_LOG = {
  failureMessage: "Tribe event attendance streak lookup failed",
  failureReason: "unexpected_event_repository_error",
  feature: "events",
  operation: "read-tribe-event-attendance-streak",
} as const;

type TribeRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

/**
 * Lightweight read of the viewer attendance streak. The events calendar asks
 * for it once when an occurrence on screen finishes, because that occurrence
 * now belongs to the last-five window and can change the streak. The body
 * also carries the next instant at which the streak can change again, so the
 * calendar keeps scheduling refreshes for occurrences outside the visible month.
 */
export async function GET(request: Request, context: TribeRouteContext) {
  const parsedParams = tribeEventAttendanceStreakRouteParamsSchema.safeParse(
    await context.params
  );

  if (!parsedParams.success) {
    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.tribeNotFoundMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.notFound
    );
  }

  const { slug } = parsedParams.data;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: ATTENDANCE_STREAK_ROUTE_LOG.feature,
    operation: ATTENDANCE_STREAK_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unauthorizedMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.unauthorized
    );
  }

  // The streak and its next refresh come from one read (a single database
  // snapshot) at one reference instant, the database clock of that read, so a
  // schedule change committed while the route runs can never show up in one
  // value and not in the other. `new Date()` only sizes the read ranges.
  try {
    const { attendanceStreak, computedAt, nextRefreshAt } =
      await modules.events.useCases.getTribeEventAttendanceStreakSnapshot({
        now: new Date(),
        tribeSlug: slug,
      });

    return createJsonResponse(
      tribeEventAttendanceStreakResponseDtoSchema.parse({
        attendanceStreak,
        attendanceStreakComputedAt: computedAt,
        attendanceStreakNextRefreshAt: nextRefreshAt,
      }),
      TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
    );
  } catch (error) {
    logger.error({
      message: ATTENDANCE_STREAK_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        reason: ATTENDANCE_STREAK_ROUTE_LOG.failureReason,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceStreakMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
