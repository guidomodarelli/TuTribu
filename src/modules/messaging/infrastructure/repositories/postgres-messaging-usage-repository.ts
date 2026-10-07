/** Reads current usage country facts inside the owner's already guarded transaction. */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingCountryPolicy, MessagingCountryPolicyRepository, MessagingCountryRestriction, MessagingConnectionCountryScope, MessagingConnectionCountryPolicyRepository } from "@/src/modules/messaging/domain/repositories/messaging-usage-policy-repository";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_CONNECTION_SLOT } from "@/src/modules/messaging/constants/messaging-connection";

/** Private SQL collaborator; it never acquires another checkout or initializes a policy. */
export class PostgresMessagingUsageRepository implements MessagingCountryPolicyRepository, MessagingConnectionCountryPolicyRepository {
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
    return this.readCountryPolicyScope(tribeId);
  }

  /**
   * Reads only the explicitly authorized current candidate/selected version, without changing admission's reader.
   * @param scope - Server-resolved resource identity and fixed internal slot.
   * @returns Sole current country policy and this resource's checked restrictions.
   */
  async readCountryPolicyForConnection(scope: MessagingConnectionCountryScope): Promise<MessagingCountryPolicy | null> {
    return this.readCountryPolicyScope(scope.tribeId, scope);
  }

  /**
   * Holds policy/resource/capability locks for the caller's decision and rechecks authority after waits.
   * @param tribeId - Exact tenant authorized by the owning callback.
   * @param scope - Optional explicit live resource; absence always means the current selected connection.
   * @returns Current facts, never cached queue/client data or a provider payload.
   */
  private async readCountryPolicyScope(tribeId: string, scope?: MessagingConnectionCountryScope): Promise<MessagingCountryPolicy | null> {
    await this.assertAuthorized(tribeId);
    const policy = (await this.database.execute<{ tribe_id: string; version: number; allowed_countries: string[] }>(sql`select tribe_id,version,allowed_countries from public.messaging_usage_policies where tribe_id=${tribeId} for share`)).rows[0];
    if (scope) {
      if (!Number.isInteger(scope.connectionVersion) || scope.connectionVersion <= 0
        || (scope.slot !== MESSAGING_CONNECTION_SLOT.selected && scope.slot !== MESSAGING_CONNECTION_SLOT.candidate)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      const currentSlot = scope.slot === MESSAGING_CONNECTION_SLOT.selected
        ? sql`connection.is_selected and connection.selected_version=${scope.connectionVersion}`
        : sql`connection.is_candidate and connection.candidate_version=${scope.connectionVersion}`;
      const resource = (await this.database.execute(sql`select resource.id from public.tenant_messaging_connections connection join public.messaging_connection_versions resource on resource.connection_id=connection.id and resource.tribe_id=connection.tribe_id where connection.id=${scope.connectionId} and connection.tribe_id=${tribeId} and resource.version=${scope.connectionVersion} and ${currentSlot} and connection.retired_at is null and resource.retired_at is null for share of connection,resource`)).rows[0];
      await this.assertAuthorized(tribeId);
      if (!resource) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    }
    if (!policy) { await this.assertAuthorized(tribeId); return null; }
    const resourceVersion = scope ? sql`${scope.connectionVersion}` : sql`connection.selected_version`;
    const resourceSelection = scope ? sql`connection.id=${scope.connectionId}` : sql`connection.is_selected`;
    const capabilities = (await this.database.execute<{ platform_restrictions: unknown }>(sql`select capability.platform_restrictions from public.tenant_messaging_connections connection inner join public.messaging_connection_versions resource on resource.connection_id=connection.id and resource.tribe_id=connection.tribe_id and resource.version=${resourceVersion} inner join public.messaging_connection_capabilities capability on capability.connection_id=resource.connection_id and capability.tribe_id=resource.tribe_id and capability.connection_version=resource.version where connection.tribe_id=${tribeId} and ${resourceSelection} and connection.retired_at is null and resource.retired_at is null and capability.checked_at is not null order by connection.id,capability.channel for share of connection,resource,capability`)).rows;
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
