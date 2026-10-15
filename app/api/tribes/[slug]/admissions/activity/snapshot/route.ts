/** Shares the native SSR read composition for explicit refresh, filters and private restoration. @module admission-activity-snapshot-route */
import { createAdmissionActivityRequestModule } from "@/src/modules/setup";
import { createAdmissionActivityPageHandler } from "@/src/modules/academy-admissions/infrastructure/api/admission-activity-page-handler";

/** @param request - Native same-origin read. @param context - Framework routing only. @returns One leader-authorized own page snapshot with private HTTP semantics. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAdmissionActivityPageHandler(async () => (await createAdmissionActivityRequestModule()).createPage())(request, context);
}
