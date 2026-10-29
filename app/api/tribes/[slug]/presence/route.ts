import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const PRESENCE_ROUTE_LOG = {
  feature: "tribes",
  operation: "touch-tribe-presence",
  touchFailureMessage: "Tribe presence touch failed",
} as const;

const PRESENCE_ROUTE_RESPONSE = {
  unauthorizedMessage: "Iniciá sesión para registrar tu presencia.",
  unexpectedMessage: "No pudimos registrar tu presencia.",
} as const;

const MEMBER_ROUTE_SCOPE = {
  feature: PRESENCE_ROUTE_LOG.feature,
  operation: PRESENCE_ROUTE_LOG.operation,
  unauthorizedMessage: PRESENCE_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function POST(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: PRESENCE_ROUTE_LOG.touchFailureMessage,
      metadata: { slug },
      responseMessage: PRESENCE_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const touched = await modules.tribes.useCases.touchTribePresence({
        tribeSlug: slug,
      });

      return createRouteJsonResponse({ touched }, HTTP_STATUS.ok);
    }
  );
}
