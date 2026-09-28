/**
 * Opens the request scope of the academy and verification route handlers.
 * It lives in the app layer because it composes the request modules
 * (composition root); module code never imports `@/src/modules/setup`.
 *
 * @module academy-route-scope
 */

import { createRequestModules } from "@/src/modules/setup";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_LOG,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
  type ServerLogger,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

type RequestModules = Awaited<ReturnType<typeof createRequestModules>>;

export type AcademyRouteScope =
  | {
      isOpen: true;
      logger: ServerLogger;
      memberId: string;
      modules: RequestModules;
      requestId: string;
    }
  | { isOpen: false; response: Response };

/**
 * Opens the request scope of an academy route. Composition or session
 * failures (pool, configuration, auth outage) become a safe 500.
 *
 * @param input - Request and operation name for logs.
 * @returns The open scope or the response to return as is.
 */
export async function openAcademyRouteScope(input: {
  operation: string;
  request: Request;
}): Promise<AcademyRouteScope> {
  const { requestId } = resolveRequestContext(input.request.headers);
  const logger = createServerLogger({
    feature: ACADEMY_ROUTE_LOG.feature,
    operation: input.operation,
    requestId,
  });

  try {
    const modules = await createRequestModules({ requestId });
    const member = await modules.auth.useCases.getAuthenticatedMember();

    if (!member) {
      return {
        isOpen: false,
        response: createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_MESSAGE.unauthorized },
          ACADEMY_HTTP_STATUS.unauthorized
        ),
      };
    }

    return { isOpen: true, logger, memberId: member.id, modules, requestId };
  } catch (error) {
    logger.error({ error, message: ACADEMY_ROUTE_LOG.scopeFailed, metadata: { requestId } });

    return {
      isOpen: false,
      response: createAcademyJsonResponse(
        { message: ACADEMY_ROUTE_MESSAGE.unexpected },
        ACADEMY_HTTP_STATUS.serverError
      ),
    };
  }
}
