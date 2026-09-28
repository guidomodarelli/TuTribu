/**
 * GET  /api/tribes/[slug]/verifications — own relations (`scope=own`) or the
 *      review queue (`scope=review`, active leader or guardian only).
 * POST /api/tribes/[slug]/verifications — request the own verification.
 *
 * @module tribe-verifications-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import {
  toMemberVerificationDto,
  toReviewQueueItemDto,
} from "@/src/modules/member-verifications/application/results/member-verification-dto-mappers";
import {
  memberVerificationDtoSchema,
  ownVerificationsDtoSchema,
  reviewQueueDtoSchema,
} from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
  createAcademyPublicResponse,
  createAcademyUnexpectedResponse,
  parseAcademyRouteInput,
  readAcademyJsonBody,
  readAcademyQuery,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import {
  academyTribeParamsSchema,
  verificationListQuerySchema,
  verificationRequestBodySchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "member-verifications";

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
    schema: verificationListQuerySchema,
    value: readAcademyQuery(request),
  });

  if (!query.isValid) {
    return query.response;
  }

  const metadata = { requestId: scope.requestId, tribeSlug: params.data.slug };

  try {
    if (query.data.scope === "own") {
      const verifications =
        await scope.modules.memberVerifications.useCases.listOwnMemberVerifications({
          tribeSlug: params.data.slug,
        });

      return createAcademyPublicResponse({
        body: { scope: "own", verifications: verifications.map(toMemberVerificationDto) },
        logger: scope.logger,
        metadata,
        schema: ownVerificationsDtoSchema,
        status: ACADEMY_HTTP_STATUS.ok,
      });
    }

    const queue = await scope.modules.memberVerifications.useCases.listVerificationReviewQueue({
      page: query.data.page,
      search: query.data.search ?? null,
      status: query.data.status ?? null,
      tribeSlug: params.data.slug,
    });

    if ("status" in queue) {
      const isForbidden = queue.status === "forbidden";

      return createAcademyJsonResponse(
        { message: isForbidden ? ACADEMY_ROUTE_MESSAGE.forbidden : ACADEMY_ROUTE_MESSAGE.notFound },
        isForbidden ? ACADEMY_HTTP_STATUS.forbidden : ACADEMY_HTTP_STATUS.notFound
      );
    }

    return createAcademyPublicResponse({
      body: {
        items: queue.items.map(toReviewQueueItemDto),
        page: query.data.page,
        scope: "review",
        total: queue.total,
      },
      logger: scope.logger,
      metadata,
      schema: reviewQueueDtoSchema,
      status: ACADEMY_HTTP_STATUS.ok,
    });
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Member verifications read failed",
      metadata,
    });
  }
}

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

  const body = parseAcademyRouteInput({
    logger: scope.logger,
    part: "body",
    schema: verificationRequestBodySchema,
    value: await readAcademyJsonBody(request),
  });

  if (!body.isValid) {
    return body.response;
  }

  const metadata = { requestId: scope.requestId, tribeSlug: params.data.slug };

  try {
    const result = await scope.modules.memberVerifications.useCases.requestMemberVerification({
      correlationId: scope.requestId,
      declaredEmail: body.data.declaredEmail,
      providerId: body.data.providerId,
      tribeSlug: params.data.slug,
    });

    switch (result.status) {
      case "created":
      case "reopened":
      case "unchanged":
        return createAcademyPublicResponse({
          body: toMemberVerificationDto(result.verification),
          logger: scope.logger,
          metadata: { ...metadata, result: result.status },
          schema: memberVerificationDtoSchema,
          status: result.status === "unchanged" ? ACADEMY_HTTP_STATUS.ok : ACADEMY_HTTP_STATUS.created,
        });
      case "provider_unavailable":
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_COPY.providerUnavailable },
          ACADEMY_HTTP_STATUS.unprocessable
        );
      case "invalid_input":
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_MESSAGE.invalidInput },
          ACADEMY_HTTP_STATUS.badRequest
        );
      case "forbidden":
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_MESSAGE.forbidden },
          ACADEMY_HTTP_STATUS.forbidden
        );
      default:
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_MESSAGE.notFound },
          ACADEMY_HTTP_STATUS.notFound
        );
    }
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Member verification request failed",
      metadata,
    });
  }
}
