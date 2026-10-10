/** Historical academy entry delegates explicit confirmed requests to the admission owner. @module academy-join-route */
import { createRequestModules } from "@/src/modules/setup";
import { createAcademyJoinHandler } from "@/src/modules/academy-admissions/infrastructure/api/academy-join-handler";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** @param request - Native input; no account/role can be selected by body. @param context - Framework tribe slug. @returns A real admission outcome or guarded historical result. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAcademyJoinHandler(async () => {
    const modules = await createRequestModules({ databaseConnectionUsage: DATABASE_CONNECTION_USAGE.maintenance });
    return {
      getViewer: () => modules.auth.useCases.getAuthenticatedMember(),
      offer: (query) => modules.productAccess.useCases.getAcademyPublicOffer(query),
      joinEntry: (command) => modules.tribes.useCases.joinTribeAcademyAdmission(command),
      joinLegacy: (command) => modules.tribes.useCases.joinTribeAcademyAdmission(command),
    };
  })(request, context);
}
