/**
 * GET  /api/tribes/[slug]/verification-providers — active providers for
 *      members; `?all=1` also lists inactive ones for the active leader.
 * POST /api/tribes/[slug]/verification-providers — create (leader only).
 *
 * @module tribe-verification-providers-route
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import { toVerificationProviderDto } from "@/src/modules/member-verifications/application/results/member-verification-dto-mappers";
import {
  verificationProviderDtoSchema,
  verificationProvidersDtoSchema,
} from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";
import { saveVerificationProviderFromRoute } from "@/app/api/tribes/[slug]/verification-providers/save-verification-provider";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
  createAcademyPublicResponse,
  createAcademyUnexpectedResponse,
  parseAcademyRouteInput,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import { academyTribeParamsSchema } from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "verification-providers";
const INCLUDE_INACTIVE_QUERY = "all";
const INCLUDE_INACTIVE_VALUE = "1";

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

  const metadata = { requestId: scope.requestId, tribeSlug: params.data.slug };

  try {
    const providers = await scope.modules.memberVerifications.useCases.listVerificationProviders({
      includeInactive:
        new URL(request.url).searchParams.get(INCLUDE_INACTIVE_QUERY) === INCLUDE_INACTIVE_VALUE,
      tribeSlug: params.data.slug,
    });

    if (!providers) {
      return createAcademyJsonResponse(
        { message: ACADEMY_ROUTE_MESSAGE.notFound },
        ACADEMY_HTTP_STATUS.notFound
      );
    }

    return createAcademyPublicResponse({
      body: { providers: providers.map(toVerificationProviderDto) },
      logger: scope.logger,
      metadata,
      schema: verificationProvidersDtoSchema,
      status: ACADEMY_HTTP_STATUS.ok,
    });
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Verification providers read failed",
      metadata,
    });
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return saveVerificationProviderFromRoute({
    context: { params: context.params.then((params) => ({ ...params, providerId: null })) },
    dtoSchema: verificationProviderDtoSchema,
    request,
  });
}
