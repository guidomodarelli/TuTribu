/** Seeds original historical candidate lifetimes without changing dates after creation or exposing credential material. @module messaging-candidate-expiration-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareContactVerificationDatabase } from "./contact-verification-database-fixture";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";

/** Names independent current resources whose original activity determines eligibility. */
export type CandidateExpirationCase = { name: "selected" | "fresh" | "expired" | "late" | "selected_with_candidate"; tribeId: string; connectionId: string; candidateVersion: number | null; selectedVersion: number | null };

/** @param name - Fixture case. @returns The candidate version persisted for the case, or null when it has no candidate. */
function candidateVersionFor(name: CandidateExpirationCase["name"]): number | null {
  if (name === "selected") return null;
  return name === "selected_with_candidate" ? 2 : 1;
}

/** @param name - Fixture case. @param selected - Whether the connection is selected. @param version - Seeded connection version. @returns Hours of idleness before the transaction time. */
function idleHoursFor(name: CandidateExpirationCase["name"], selected: boolean, version: number): number {
  if (name === "fresh") return 144;
  if (name === "late") return 216;
  return name === "selected" || (selected && version === 1) ? 240 : 170;
}

/** @param database - Exact owned disposable branch. @returns Safe fixture identity, cases and persisted snapshots without keys, ciphertext or plaintext. */
export async function prepareMessagingCandidateExpiration(database: AcademyAdmissionTestDatabase, options: { futureActivity?: string } = {}) {
  const security = await prepareContactVerificationDatabase(database);
  await database.applyMigration("20261005100000_guard_messaging_secret_retirement.sql");
  return seedMessagingCandidateExpiration(database, security, options);
}

/** @param database - Already migrated owned branch. @param security - Synthetic fixture principal/configuration. @param options - Optional persisted future activity used by clock tests. @returns Independent candidate scopes without replaying historical migrations. */
export async function seedMessagingCandidateExpiration(database: AcademyAdmissionTestDatabase, security: Pick<Awaited<ReturnType<typeof prepareContactVerificationDatabase>>, "own" | "config">, options: { futureActivity?: string } = {}) {
  const userId = randomUUID(), own = { userId, email: `${userId}@example.test` };
  await database.withContext(security.own, (transaction) => transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Responsable histórico de ejemplo',${own.email},false,transaction_timestamp()-interval '20 days',transaction_timestamp()-interval '20 days')`));
  const cases: CandidateExpirationCase[] = [];
  for (const name of ["selected", "fresh", "expired", "late", "selected_with_candidate"] as const) {
    const tribeId = randomUUID(), connectionId = randomUUID();
    const selected = name === "selected" || name === "selected_with_candidate";
    const candidateVersion = candidateVersionFor(name);
    const selectedVersion = selected ? 1 : null;
    await database.withContext(own, async (transaction) => {
      await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by,created_at) values (${tribeId},'Academia de candidatas de ejemplo',${`candidate-${tribeId}`},${userId},transaction_timestamp()-interval '19 days')`);
      await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,created_at) values (${tribeId},${userId},'leader','active',transaction_timestamp()-interval '18 days')`);
      await transaction.execute(sql`insert into public.messaging_usage_policies(tribe_id,version) values (${tribeId},3)`);
      await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,name,contributed_by_user_id,state,environment,security_epoch,is_selected,is_candidate,selected_version,candidate_version,created_at,updated_at) values (${connectionId},${tribeId},'Conexión de ejemplo',${userId},${selected ? "active" : "draft"},${security.config.environment},${security.config.securityEpoch},${selected},${candidateVersion !== null},${selectedVersion},${candidateVersion},transaction_timestamp()-interval '17 days',transaction_timestamp()-interval '16 days')`);
      for (const version of candidateVersion === 2 ? [1, 2] : [1]) {
        const secretRef = randomUUID(), idleHours = idleHoursFor(name, selected, version);
        const envelope = await createMessagingSecretCipher(security.config).seal(randomUUID(), { tribeId, connectionId, connectionVersion: version, resourceId: secretRef });
        const lastActivity = name === "fresh" && options.futureActivity ? sql`${options.futureActivity}::timestamptz` : sql`transaction_timestamp()-${idleHours}*interval '1 hour'`;
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,created_at,last_activity_at) values (${connectionId},${tribeId},${version},${security.config.environment},${security.config.securityEpoch},${secretRef},transaction_timestamp()-interval '16 days',${lastActivity})`);
        await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext,created_at) values (${secretRef},${tribeId},${connectionId},${version},${security.config.environment},${security.config.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)},transaction_timestamp()-interval '16 days')`);
      }
      await transaction.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,purpose,channel,event_type,operation_id) values (${tribeId},${userId},'connection_diagnostic','email','diagnostic_request',${randomUUID()})`);
    });
    cases.push({ name, tribeId, connectionId, candidateVersion, selectedVersion });
  }
  /** @returns Only lifecycle metadata and counts; never credential, envelope or fingerprint material. */
  const snapshot = () => database.withContext(own, async (transaction) => ({
    connections: (await transaction.execute(sql`select id,tribe_id,state,version,is_selected,is_candidate,selected_version,candidate_version,retired_at::text from public.tenant_messaging_connections where contributed_by_user_id=${userId} order by id`)).rows,
    resources: (await transaction.execute(sql`select resource.connection_id,resource.version,resource.last_activity_at::text,resource.retired_at::text,resource.purge_after::text,envelope.iv is not null and envelope.ciphertext is not null as has_material,envelope.purged_at is not null as purged,resource.secret_ref=envelope.secret_ref as reference_retained from public.messaging_connection_versions resource join public.messaging_secret_envelopes envelope on envelope.secret_ref=resource.secret_ref where resource.connection_id in (${sql.join(cases.map((entry) => sql`${entry.connectionId}`), sql`, `)}) order by resource.connection_id,resource.version`)).rows,
    usage: (await transaction.execute(sql`select tribe_id,version,allowed_countries,verification_daily_limit,notification_daily_limit from public.messaging_usage_policies where tribe_id in (${sql.join(cases.map((entry) => sql`${entry.tribeId}`), sql`, `)}) order by tribe_id`)).rows,
    events: (await transaction.execute(sql`select id,tribe_id,occurred_at::text from public.messaging_usage_events where actor_user_id=${userId} order by id`)).rows,
  }));
  return { own, userId, cases, snapshot };
}
