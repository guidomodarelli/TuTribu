/**
 * GET  /api/tribes/[slug]/verifications — own relations (`scope=own`) or the
 *      review queue (`scope=review`, active leader or guardian only).
 * POST /api/tribes/[slug]/verifications — request the own verification.
 *
 * @module tribe-verifications-route
 */

import {
  createAcademyFailureResponse,
  handleAcademyRoute,
  type AcademyTribeRouteContext,
} from "@/app/api/tribes/[slug]/academy-route-scope";
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
  createAcademyJsonResponse,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import {
  academyTribeParamsSchema,
  verificationListQuerySchema,
  verificationRequestBodySchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "member-verifications";

export async function GET(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Member verifications read failed",
      operation: OPERATION,
      schemas: { params: academyTribeParamsSchema, query: verificationListQuerySchema },
    },
    async ({ modules, params, query, respond }) => {
      if (query.scope === "own") {
        const verifications =
          await modules.memberVerifications.useCases.listOwnMemberVerifications({
            tribeSlug: params.slug,
          });

        return respond(
          { scope: "own", verifications: verifications.map(toMemberVerificationDto) },
          ownVerificationsDtoSchema,
          ACADEMY_HTTP_STATUS.ok
        );
      }

      const queue = await modules.memberVerifications.useCases.listVerificationReviewQueue({
        page: query.page,
        search: query.search ?? null,
        status: query.status ?? null,
        tribeSlug: params.slug,
      });

      if ("status" in queue) {
        return createAcademyFailureResponse(queue.status);
      }

      return respond(
        {
          items: queue.items.map(toReviewQueueItemDto),
          page: query.page,
          scope: "review",
          total: queue.total,
        },
        reviewQueueDtoSchema,
        ACADEMY_HTTP_STATUS.ok
      );
    }
  );
}

export async function POST(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Member verification request failed",
      operation: OPERATION,
      schemas: { body: verificationRequestBodySchema, params: academyTribeParamsSchema },
    },
    async ({ body, modules, params, requestId, respond }) => {
      const result = await modules.memberVerifications.useCases.requestMemberVerification({
        correlationId: requestId,
        declaredEmail: body.declaredEmail,
        providerId: body.providerId,
        tribeSlug: params.slug,
      });

      if (
        result.status === "created" ||
        result.status === "reopened" ||
        result.status === "unchanged"
      ) {
        return respond(
          toMemberVerificationDto(result.verification),
          memberVerificationDtoSchema,
          result.status === "unchanged" ? ACADEMY_HTTP_STATUS.ok : ACADEMY_HTTP_STATUS.created,
          { result: result.status }
        );
      }

      if (result.status === "provider_unavailable") {
        return createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_COPY.providerUnavailable },
          ACADEMY_HTTP_STATUS.unprocessable
        );
      }

      return createAcademyFailureResponse(result.status);
    }
  );
}
