import { createRequestModules } from "@/src/modules/setup";
import { createRouteObservation } from "@/src/modules/shared/infrastructure/observability/route-observation";

const SITEPING_IDENTITY_ROUTE = {
  feature: "siteping",
  operation: "siteping-identity",
} as const;

const HTTP_STATUS = {
  ok: 200,
  serverError: 500,
} as const;

export async function GET(request: Request) {
  const observation = createRouteObservation({
    feature: SITEPING_IDENTITY_ROUTE.feature,
    operation: SITEPING_IDENTITY_ROUTE.operation,
    request,
  });

  try {
    const modules = await createRequestModules();
    const authenticatedMember =
      await modules.auth.useCases.getAuthenticatedMember();
    const memberTribes = authenticatedMember
      ? await modules.tribes.useCases.getMemberTribes()
      : [];

    return observation.createJsonResponse(
      modules.siteping.useCases.getIdentity({
        authenticatedMember,
        memberTribes,
      }),
      HTTP_STATUS.ok
    );
  } catch (error) {
    observation.logRouteError({
      error,
      message: "Siteping identity lookup failed",
      outcome: "error",
      status: HTTP_STATUS.serverError,
    });

    return observation.createJsonResponse(
      {
        enabled: false,
        identity: null,
        projectName: "tutribu",
      },
      HTTP_STATUS.serverError
    );
  }
}
