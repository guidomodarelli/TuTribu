/**
 * GET /api/tribes/[slug]/academy/members — access overview for reviewers.
 * Leaders see every source and private notes; guardians only see whether the
 * member has access.
 *
 * @module academy-members-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademyMembersPageDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academyMembersPageDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
  createAcademyPublicResponse,
  createAcademyUnexpectedResponse,
  parseAcademyRouteInput,
  readAcademyQuery,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import {
  academyMembersQuerySchema,
  academyTribeParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-members";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
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

  const query = parseAcademyRouteInput({
    logger: scope.logger,
    part: "query",
    schema: academyMembersQuerySchema,
    value: readAcademyQuery(request),
  });

  if (!query.isValid) {
    return query.response;
  }

  try {
    const result = await scope.modules.productAccess.useCases.listAcademyMembers({
      page: query.data.page,
      search: query.data.search ?? null,
      tribeSlug: params.data.slug,
    });

    if (result.status !== "ok") {
      const isForbidden = result.status === "forbidden";

      return createAcademyJsonResponse(
        { message: isForbidden ? ACADEMY_ROUTE_MESSAGE.forbidden : ACADEMY_ROUTE_MESSAGE.notFound },
        isForbidden ? ACADEMY_HTTP_STATUS.forbidden : ACADEMY_HTTP_STATUS.notFound
      );
    }

    return createAcademyPublicResponse({
      body: toAcademyMembersPageDto(result.page, query.data.page),
      logger: scope.logger,
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
      schema: academyMembersPageDtoSchema,
      status: ACADEMY_HTTP_STATUS.ok,
    });
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Academy members read failed",
      metadata: { requestId: scope.requestId, tribeSlug: params.data.slug },
    });
  }
}
