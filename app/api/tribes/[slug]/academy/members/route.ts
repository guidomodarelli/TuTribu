/**
 * GET /api/tribes/[slug]/academy/members — access overview for reviewers.
 * Leaders see every source and private notes; guardians only see whether the
 * member has access.
 *
 * @module academy-members-route
 */

import {
  createAcademyFailureResponse,
  handleAcademyRoute,
  type AcademyTribeRouteContext,
} from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademyMembersPageDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academyMembersPageDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { ACADEMY_HTTP_STATUS } from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import {
  academyMembersQuerySchema,
  academyTribeParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-members";

export async function GET(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Academy members read failed",
      operation: OPERATION,
      schemas: { params: academyTribeParamsSchema, query: academyMembersQuerySchema },
    },
    async ({ modules, params, query, respond }) => {
      const result = await modules.productAccess.useCases.listAcademyMembers({
        page: query.page,
        search: query.search ?? null,
        tribeSlug: params.slug,
      });

      if (result.status !== "ok") {
        return createAcademyFailureResponse(result.status);
      }

      return respond(
        toAcademyMembersPageDto(result.page, query.page),
        academyMembersPageDtoSchema,
        ACADEMY_HTTP_STATUS.ok
      );
    }
  );
}
