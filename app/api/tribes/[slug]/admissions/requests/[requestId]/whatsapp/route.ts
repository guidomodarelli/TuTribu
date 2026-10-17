/** Composes own pending declared-number edits through the admission application owner. @module admission-whatsapp-number-route */
import { createAdmissionRequestModules } from "@/src/modules/setup";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { createAdmissionWhatsappNumberHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-whatsapp-number-handler";

/** @param request - Native own correction and original observed version. @param context - Framework resource params. @returns Minimal confirmed history or registered progress without the private number. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  return createAdmissionWhatsappNumberHandler(async () => {
    const modules = await createAdmissionRequestModules(DATABASE_CONNECTION_USAGE.maintenance);
    return { resolveTribe: modules.queries.resolveTribe, updateWhatsappNumber: modules.manual.updateWhatsappNumber };
  })(request, context);
}
