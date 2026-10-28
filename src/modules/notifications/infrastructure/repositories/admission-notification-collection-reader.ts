/** Pins shared current identity and email readiness inside one existing collection transaction. @module admission-notification-collection-reader */
import "server-only";
import { sql } from "drizzle-orm";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresAdmissionVerificationReadinessReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-verification-readiness-reader";
import { VERIFICATION_EMAIL_CHANNEL } from "@/src/modules/messaging/constants/verification-delivery";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { AdmissionNotificationRecipientEmailScope } from "../../domain/entities/admission-notification-recipient-email";
import type { AdmissionNotificationPreferenceMode } from "../../domain/entities/admission-notification-preference";
import { PostgresAdmissionNotificationRecipientEmailReader } from "./postgres-admission-notification-recipient-email-reader";

/** Consumes only current native membership fields, never a browser permission flag. */
type MembershipRow = { user_id: string; role: string; status: string };
/** Keeps each original recipient's current preference independently of other page entries. */
type PreferenceRow = { recipient_user_id: string; mode: AdmissionNotificationPreferenceMode; version: number; effective_from_microseconds: string };
/** Keeps the current locked tenant settings without exposing a provider DTO. */
type SettingsRow = { enabled: boolean; version: number; enabled_at_microseconds: string | null; time_zone: string };
/** Shares only same-call native facts; the owner still evaluates every source with a fresh clock. */
export type AdmissionNotificationCollectionFacts = {
  readonly trustedScopes: ReadonlySet<AdmissionNotificationRecipientEmailScope>;
  readonly memberships: ReadonlyMap<string, MembershipRow>;
  readonly preferences: ReadonlyMap<string, PreferenceRow>;
  readonly settings: SettingsRow | null;
  readonly emailPrepared: boolean;
};
/** Requires current private backend authority in the caller's original native transaction. */
type CollectionAuthorizer = (database: RequestDatabase, tribeId: string) => Promise<boolean>;

/** Keeps recipient locks ahead of new group writes and does not cache facts between calls or transactions. */
export class AdmissionNotificationCollectionReader {
  /** @param database - Existing guarded collection transaction. @param authorize - Current backend-purpose scope. @param readSecurityConfig - Live local external scope, never a provider RPC. */
  constructor(private readonly database: RequestDatabase, private readonly authorize: CollectionAuthorizer, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** @param tribeId - Exact tenant fenced by the collection owner. @param scopes - New, existing server-selected notice references from one bounded page. @returns Shared locked facts plus independently trusted original scopes; storage/runtime errors reject the complete read. */
  async read(tribeId: string, scopes: readonly AdmissionNotificationRecipientEmailScope[]): Promise<AdmissionNotificationCollectionFacts> {
    const batches = new Map<string, AdmissionNotificationRecipientEmailScope[]>();
    for (const scope of scopes) {
      const key = JSON.stringify([scope.recipientUserId, scope.audience]);
      const batch = batches.get(key);
      if (batch) batch.push(scope); else batches.set(key, [scope]);
    }
    const trustedScopes = new Set<AdmissionNotificationRecipientEmailScope>();
    const reader = new PostgresAdmissionNotificationRecipientEmailReader(this.database, async () => { const current = await this.readSecurityConfig(); return { environment: current.environment, securityEpoch: current.securityEpoch }; });
    // A deterministic recipient/audience order also applies when two tenant pages share user accounts.
    for (const key of [...batches.keys()].sort()) {
      const batch = batches.get(key);
      if (!batch) continue;
      const first = batch[0];
      const destinations = await reader.readBatch({ tribeId, recipientUserId: first.recipientUserId, audience: first.audience, obligationIds: batch.map((scope) => scope.obligationId) });
      for (const scope of batch) if (destinations.has(scope.obligationId)) trustedScopes.add(scope);
    }
    const recipientIds = [...new Set(scopes.map((scope) => scope.recipientUserId))];
    const memberships = new Map((await this.database.execute<MembershipRow>(sql`select user_id,role,status from public.tribe_members where tribe_id=${tribeId} and user_id=any(${sql.param(recipientIds)}::text[]) order by user_id for share`)).rows.map((membership) => [membership.user_id, membership]));
    const settings = (await this.database.execute<SettingsRow>(sql`select enabled,version,(extract(epoch from enabled_at)*${MICROSECONDS_PER_SECOND})::bigint::text as enabled_at_microseconds,time_zone from public.admission_email_settings where tribe_id=${tribeId} for share`)).rows[0] ?? null;
    const preferences = new Map((await this.database.execute<PreferenceRow>(sql`select recipient_user_id,mode,version,(extract(epoch from effective_from)*${MICROSECONDS_PER_SECOND})::bigint::text as effective_from_microseconds from public.admission_notification_preferences where tribe_id=${tribeId} and recipient_user_id=any(${sql.param(recipientIds)}::text[]) order by recipient_user_id for share`)).rows.map((preference) => [preference.recipient_user_id, preference]));
    if (!settings) return { trustedScopes, memberships, preferences, settings, emailPrepared: false };
    const selected = (await this.database.execute<{ id: string; selected_version: number }>(sql`select id,selected_version from public.tenant_messaging_connections where tribe_id=${tribeId} and is_selected and retired_at is null order by id for share`)).rows[0];
    const readiness = await new PostgresAdmissionVerificationReadinessReader(this.database, this.authorize, this.readSecurityConfig).read({ tribeId, connectionId: selected?.id ?? null, connectionVersion: selected?.selected_version ?? null, channel: VERIFICATION_EMAIL_CHANNEL, requiresSmsAlternative: false });
    const current = await this.readSecurityConfig(), security = readiness.securityScope;
    const emailPrepared = Boolean(readiness.channelPrepared && security && !current.recoveryLocked && security.environment === current.environment && security.securityEpoch === current.securityEpoch && current.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(security.credentialKeyId));
    return { trustedScopes, memberships, preferences, settings, emailPrepared };
  }
}
