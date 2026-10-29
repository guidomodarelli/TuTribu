/**
 * GET  /api/tribes/[slug]/verification-providers — active providers for
 *      members; `?all=1` also lists inactive ones for the active leader.
 * POST /api/tribes/[slug]/verification-providers — create (leader only).
 *
 * @module tribe-verification-providers-route
 */

import {
  createAcademyNotFoundResponse,
  handleAcademyRoute,
  type AcademyTribeRouteContext,
} from "@/app/api/tribes/[slug]/academy-route-scope";
import { toVerificationProviderDto } from "@/src/modules/member-verifications/application/results/member-verification-dto-mappers";
import {
  verificationProviderDtoSchema,
  verificationProvidersDtoSchema,
} from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";
import { saveVerificationProviderFromRoute } from "@/app/api/tribes/[slug]/verification-providers/save-verification-provider";
import { ACADEMY_HTTP_STATUS } from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import { academyTribeParamsSchema } from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "verification-providers";
const INCLUDE_INACTIVE_QUERY = "all";
const INCLUDE_INACTIVE_VALUE = "1";

export async function GET(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Verification providers read failed",
      operation: OPERATION,
      schemas: { params: academyTribeParamsSchema },
    },
    async ({ modules, params, respond }) => {
      const providers = await modules.memberVerifications.useCases.listVerificationProviders({
        includeInactive:
          new URL(request.url).searchParams.get(INCLUDE_INACTIVE_QUERY) === INCLUDE_INACTIVE_VALUE,
        tribeSlug: params.slug,
      });

      if (!providers) {
        return createAcademyNotFoundResponse();
      }

      return respond(
        { providers: providers.map(toVerificationProviderDto) },
        verificationProvidersDtoSchema,
        ACADEMY_HTTP_STATUS.ok
      );
    }
  );
}

export async function POST(request: Request, context: AcademyTribeRouteContext) {
  return saveVerificationProviderFromRoute({
    context: { params: context.params.then((params) => ({ ...params, providerId: null })) },
    dtoSchema: verificationProviderDtoSchema,
    request,
  });
}
