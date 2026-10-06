/** Reads current usage country facts inside the owner's already guarded transaction. */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingCountryPolicy, MessagingCountryPolicyRepository, MessagingCountryRestriction } from "@/src/modules/messaging/domain/repositories/messaging-usage-policy-repository";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Private SQL collaborator; it never acquires another checkout or initializes a policy. */
export class PostgresMessagingUsageRepository implements MessagingCountryPolicyRepository {
  /**
   * @param database - Existing guarded transaction; the caller keeps locks through its decision.
   * @param authorize - Mandatory owner authorization that checks current actor/session/purpose under locks.
   */
  constructor(private readonly database: RequestDatabase, private readonly authorize: (database: RequestDatabase, tribeId: string) => Promise<boolean>) {}

  /** Checks the owner hook without treating a claimed tribe or old snapshot as permission. */
  private async assertAuthorized(tribeId: string): Promise<void> {
    if (!await this.authorize(this.database, tribeId)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  }

  /**
   * Samples the current configuration and selected resource while retaining shared locks.
   * The owner must lock tribe before calling, consistently with dispatch's shared order.
   * No schema is applied to PostgreSQL rows; only consumed JSON fields are narrowed.
   * @param tribeId - Exact authorized tenant scope.
   * @returns Minimal current country facts without credentials, counters or another editable list.
   */
  async readCountryPolicy(tribeId: string): Promise<MessagingCountryPolicy | null> {
    await this.assertAuthorized(tribeId);
    const policy = (await this.database.execute<{ tribe_id: string; version: number; allowed_countries: string[] }>(sql`select tribe_id,version,allowed_countries from public.messaging_usage_policies where tribe_id=${tribeId} for share`)).rows[0];
    if (!policy) { await this.assertAuthorized(tribeId); return null; }
    const capabilities = (await this.database.execute<{ platform_restrictions: unknown }>(sql`select capability.platform_restrictions from public.tenant_messaging_connections connection inner join public.messaging_connection_versions resource on resource.connection_id=connection.id and resource.tribe_id=connection.tribe_id and resource.version=connection.selected_version inner join public.messaging_connection_capabilities capability on capability.connection_id=resource.connection_id and capability.tribe_id=resource.tribe_id and capability.connection_version=resource.version where connection.tribe_id=${tribeId} and connection.is_selected and connection.retired_at is null and resource.retired_at is null and capability.checked_at is not null order by connection.id,capability.channel for share of connection,resource,capability`)).rows;
    const platformRestrictions: MessagingCountryRestriction[] = [];
    for (const capability of capabilities) {
      if (!Array.isArray(capability.platform_restrictions)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      for (const restriction of capability.platform_restrictions) {
        if (typeof restriction !== "object" || restriction === null) continue;
        const { country, channel, allowed } = restriction;
        if (typeof country === "string" && (channel === "sms" || channel === "whatsapp")) {
          if (typeof allowed !== "boolean") throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
          platformRestrictions.push({ country, channel, allowed });
        }
      }
    }
    // Locks/reads can consume a session's remaining lifetime; rows do not freeze time.
    await this.assertAuthorized(tribeId);
    return { tribeId: policy.tribe_id, version: policy.version, allowedCountries: [...policy.allowed_countries], platformRestrictions };
  }
}
