/** Bridges contact keyrings onto stable budget subjects and closes an unprovable active-window retirement. @module postgres-messaging-contact-budget-repository */
import "server-only";
import { sql } from "drizzle-orm";
import { CONTACT_BUDGET_FINGERPRINT_DOMAIN, CONTACT_BUDGET_LOCK_DOMAIN, CONTACT_BUDGET_CONTINUITY_WINDOW_MS, CONTACT_BUDGET_REQUEST_EVENT } from "@/src/modules/messaging/constants/contact-budget";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MessagingUsageBudgetError } from "@/src/modules/messaging/domain/errors/messaging-usage-budget-error";
import type { MessagingContactBudgetIdentity, MessagingContactBudgetRepository } from "@/src/modules/messaging/domain/repositories/messaging-contact-budget-repository";
import type { AdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Key ids identify immutable platform key material; a rotation must use a new id and retain its needed predecessors. */
export class PostgresMessagingContactBudgetRepository implements MessagingContactBudgetRepository {
  /**
   * @param database - Current caller's guarded transaction; alias locks survive until its commit/rollback.
   * @param authorize - Required current account/session/purpose authority, without a permissive fallback.
   * @param readSecurityConfig - Local external keyring/recovery snapshot; no provider call is allowed here.
   */
  constructor(private readonly database: RequestDatabase, private readonly authorize: (database: RequestDatabase) => Promise<boolean>, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** Checks the actual SQL principal before any private platform-key operation. */
  private async assertAuthorized(): Promise<void> {
    if (!(await this.database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor || !await this.authorize(this.database)) throw new MessagingUsageBudgetError(MESSAGING_ERROR_CODE.permissionDenied);
  }

  /**
   * Resolves retained fingerprints without using tribe, channel, actor or security epoch as a budget reset.
   * @param contact - Already normalized own email/phone; it never becomes a public fingerprint.
   * @returns Stable private subject and current index material, after context/keyring postvalidation.
   * @throws MessagingUsageBudgetError when authority, recovery or consumption continuity cannot be established.
   */
  async resolve(contact: AdmissionContact): Promise<MessagingContactBudgetIdentity> {
    await this.assertAuthorized();
    const config = await this.readSecurityConfig();
    if (config.recoveryLocked) throw new MessagingUsageBudgetError(MESSAGING_ERROR_CODE.resourceUnavailable);
    const ring = config.keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint];
    if (!ring.keys.has(ring.activeKeyId)) throw new MessagingUsageBudgetError(MESSAGING_ERROR_CODE.resourceUnavailable);
    const fingerprints: { keyId: string; fingerprint: Uint8Array }[] = [];
    // Global contact accounting intentionally excludes mutable connection/tribe/channel/epoch fields.
    for (const [keyId, key] of [...ring.keys].sort(([leftId], [rightId]) => leftId < rightId ? -1 : leftId > rightId ? 1 : 0)) {
      const data = new TextEncoder().encode(JSON.stringify([CONTACT_BUDGET_FINGERPRINT_DOMAIN, keyId, contact.type, contact.value]));
      const fingerprint = new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, key, data));
      fingerprints.push({ keyId, fingerprint });
      await this.database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([CONTACT_BUDGET_LOCK_DOMAIN, keyId, Buffer.from(fingerprint).toString("hex")])},0))`);
    }
    const keyIds = fingerprints.map((entry) => entry.keyId);
    const matches = (await this.database.execute<{ subject_id: string }>(sql`select subject_id from public.messaging_contact_fingerprint_aliases where ${sql.join(fingerprints.map((entry) => sql`(fingerprint_key_id=${entry.keyId} and contact_fingerprint=${Buffer.from(entry.fingerprint)})`), sql` or `)} for share`)).rows;
    const subjectIds = new Set(matches.map((match) => match.subject_id));
    if (subjectIds.size > 1) throw new MessagingUsageBudgetError(MESSAGING_ERROR_CODE.usageLimitReached);
    let subjectId = [...subjectIds][0];
    if (!subjectId) {
      const now = new Date((await this.database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      const unresolved = (await this.database.execute(sql`
        select 1 from public.messaging_usage_events event
        where event.event_type=${CONTACT_BUDGET_REQUEST_EVENT} and event.contact_subject_id is not null
          and event.occurred_at>${new Date(now.getTime()-CONTACT_BUDGET_CONTINUITY_WINDOW_MS)} and event.occurred_at<=${now}
          and not exists(select 1 from public.messaging_contact_fingerprint_aliases alias where alias.subject_id=event.contact_subject_id and alias.fingerprint_key_id in (${sql.join(keyIds.map((keyId) => sql`${keyId}`),sql`, `)}))
        limit 1
      `)).rows[0];
      if (unresolved) throw new MessagingUsageBudgetError(MESSAGING_ERROR_CODE.usageLimitReached);
      subjectId = (await this.database.execute<{ id: string }>(sql`insert into public.messaging_contact_budget_subjects default values returning id`)).rows[0].id;
    }
    for (const entry of fingerprints) {
      await this.database.execute(sql`insert into public.messaging_contact_fingerprint_aliases(subject_id,fingerprint_key_id,contact_fingerprint) values (${subjectId},${entry.keyId},${Buffer.from(entry.fingerprint)}) on conflict(fingerprint_key_id,contact_fingerprint) do nothing`);
    }
    await this.assertAuthorized();
    const current = await this.readSecurityConfig();
    const currentRing = current.keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint];
    if (current.recoveryLocked || current.environment !== config.environment || current.securityEpoch !== config.securityEpoch || currentRing.activeKeyId !== ring.activeKeyId || JSON.stringify([...currentRing.keys.keys()].sort()) !== JSON.stringify([...ring.keys.keys()].sort())) throw new MessagingUsageBudgetError(MESSAGING_ERROR_CODE.resourceUnavailable);
    const active = fingerprints.find((entry) => entry.keyId === ring.activeKeyId)!;
    return { subjectId, fingerprintKeyId: active.keyId, fingerprint: active.fingerprint };
  }
}
