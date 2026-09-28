/**
 * POST /api/tribes/[slug]/academy/join — basic academy admission (idempotent).
 *
 * @module academy-join-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import {
  ACADEMY_HTTP_STATUS,
  createAcademyJsonResponse,
  createAcademyUnexpectedResponse,
  parseAcademyRouteInput,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import { academyTribeParamsSchema } from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-join";

const JOIN_RESPONSE = {
  admission_closed: { message: ACADEMY_ROUTE_COPY.admissionClosed, status: ACADEMY_HTTP_STATUS.forbidden },
  already_member: { message: ACADEMY_ROUTE_COPY.alreadyMember, status: ACADEMY_HTTP_STATUS.ok },
  blocked: { message: ACADEMY_ROUTE_COPY.blocked, status: ACADEMY_HTTP_STATUS.forbidden },
  joined: { message: ACADEMY_ROUTE_COPY.joined, status: ACADEMY_HTTP_STATUS.created },
} as const;

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const scope = await openAcademyRouteScope({ operation: OPERATION, request });

  if (!scope.isOpen) {
    return scope.response;
  }

  const params = parseAcademyRouteInput({
    logger: scope.logger,
    part: "params",
    schema: academyTribeParamsSchema,
    value: await context.params,
  });

  if (!params.isValid) {
    return params.response;
  }

  try {
    const result = await scope.modules.tribes.useCases.joinTribeAcademyAdmission({
      tribeSlug: params.data.slug,
    });
    const response = JOIN_RESPONSE[result.status];

    return createAcademyJsonResponse(
      { message: response.message, status: result.status },
      response.status
    );
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Academy join failed",
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
    });
  }
}
