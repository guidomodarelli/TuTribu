/** Supplies an activation preflight port for tests whose cutover inventory is verified elsewhere, while the tenant facts still come from real rows. @module admission-tenant-rows-preflight */
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionActivationPreflightReader } from "@/src/modules/academy-admissions/domain/repositories/admission-activation-preflight-reader";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";

/**
 * @param transaction - Scenario transaction. @param isPrepared - Cutover result for the requested tribe; the real inventory has its own parity suite.
 * @returns A port that reads the academy settings and protection marker of the requested tribe from the database, so preparation facts stay real.
 */
export function createTenantRowsPreflight(transaction: RequestDatabase, isPrepared: (tribeId: string) => boolean): AdmissionActivationPreflightReader {
  return {
    async readPreparation(tribeId) {
      const tenant = (await transaction.execute<{ access_model: string | null; admission_enabled: boolean | null; activated: boolean | null }>(sql`select (select access_model from public.tribe_academy_settings where tribe_id=${tribeId}) as access_model,(select admission_enabled from public.tribe_academy_settings where tribe_id=${tribeId}) as admission_enabled,(select admissions_control_activated_at is not null from public.tribes where id=${tribeId}) as activated`)).rows[0];
      return { prepared: isPrepared(tribeId), isAcademy: tenant?.access_model === TRIBE_ACCESS_MODEL.academy, evaluatorEnabled: tenant?.admission_enabled === true, controlActivated: tenant?.activated === true };
    },
  };
}
