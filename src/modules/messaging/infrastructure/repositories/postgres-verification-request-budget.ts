/** Accounts for requested codes across tenants/contacts/channels without consuming an external-send quota. @module postgres-verification-request-budget */
import "server-only";
import { sql } from "drizzle-orm";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import type { VerificationRequestBudget, VerificationRequestBudgetCommand, VerificationRequestBudgetResult } from "@/src/modules/academy-admissions/domain/repositories/verification-request-budget";
import type { MessagingContactBudgetRepository } from "@/src/modules/messaging/domain/repositories/messaging-contact-budget-repository";
import { MESSAGING_USAGE_LIMIT } from "@/src/modules/messaging/constants/messaging-limits";
import { CODE_REQUEST_ACCOUNT_LOCK_DOMAIN, CODE_REQUEST_CONTACT_LOCK_DOMAIN, CODE_REQUEST_DIAGNOSTIC_LOCK_DOMAIN, CODE_REQUEST_HOURLY_WINDOW_MS, CODE_REQUEST_EVENT } from "@/src/modules/messaging/constants/code-request-budget";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Requires the issuer's current policy/resource authority and shares its single guarded transaction. */
export class PostgresVerificationRequestBudget implements VerificationRequestBudget {
  /**
   * @param database - Current authorized caller transaction.
   * @param authorize - Current account/session/tribe/purpose reader, with the owner's shared lock order.
   * @param contacts - Platform keyring/contact continuity collaborator on this same transaction.
   */
  constructor(private readonly database: RequestDatabase, private readonly authorize: (database: RequestDatabase, command: VerificationRequestBudgetCommand) => Promise<boolean>, private readonly contacts: MessagingContactBudgetRepository) {}

  /**
   * Checks current SQL identity before and after any awaited lookup or account lock.
   * @param command - Original current owner scope bound to the issuer's operation ledger.
   * @returns Whether the actual SQL actor still has the owner's current authorization.
   */
  private async isAuthorized(command: VerificationRequestBudgetCommand): Promise<boolean> {
    return (await this.database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor === command.scope.userId && await this.authorize(this.database, command);
  }

  /**
   * Consumes one original request while preserving contact/account budgets across tribe/purpose/channel changes.
   * @param command - Authorized original operation/challenge intent, resolved by the caller's ledger.
   * @returns A private current contact identity and confirmed accounting, or a denial without another event.
   */
  async consume(command: VerificationRequestBudgetCommand): Promise<VerificationRequestBudgetResult> {
    if (!await this.isAuthorized(command)) return { allowed: false, code: ADMISSION_ERROR_CODE.permissionDenied };
    const contact = await this.contacts.resolve(command.scope.contact);
    await this.database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([CODE_REQUEST_CONTACT_LOCK_DOMAIN, contact.subjectId])},0))`);
    await this.database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([CODE_REQUEST_ACCOUNT_LOCK_DOMAIN, command.scope.userId])},0))`);
    const diagnostic = command.scope.purpose === ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic;
    if (diagnostic) await this.database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([CODE_REQUEST_DIAGNOSTIC_LOCK_DOMAIN, command.scope.tribeId])},0))`);
    const prior = (await this.database.execute<{ actor_user_id: string | null; tribe_id: string; contact_subject_id: string | null; challenge_id: string | null; purpose: string; channel: string | null }>(sql`select actor_user_id,tribe_id,contact_subject_id,challenge_id,purpose,channel from public.messaging_usage_events where event_type=${CODE_REQUEST_EVENT.request} and operation_id=${command.operationId}`)).rows[0];
    if (!await this.isAuthorized(command)) return { allowed: false, code: ADMISSION_ERROR_CODE.permissionDenied };
    const identity = { contactSubjectId: contact.subjectId, fingerprintKeyId: contact.fingerprintKeyId, contactFingerprint: contact.fingerprint };
    if (prior) {
      if (prior.actor_user_id !== command.scope.userId || prior.tribe_id !== command.scope.tribeId || prior.contact_subject_id !== contact.subjectId || prior.challenge_id !== command.challengeId || prior.purpose !== command.scope.purpose || prior.channel !== command.scope.channel) return { allowed: false, code: ADMISSION_ERROR_CODE.idempotencyConflict };
      return { allowed: true, replayed: true, ...identity };
    }
    const now = new Date((await this.database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    const hourStart = new Date(now.getTime()-CODE_REQUEST_HOURLY_WINDOW_MS);
    const counts = (await this.database.execute<{ account_hour: number; contact_hour: number; account_day: number; contact_day: number; last_request: string | null }>(sql`
      select count(*) filter(where actor_user_id=${command.scope.userId} and occurred_at>${hourStart})::integer as account_hour,
        count(*) filter(where contact_subject_id=${contact.subjectId} and occurred_at>${hourStart})::integer as contact_hour,
        count(*) filter(where actor_user_id=${command.scope.userId} and occurred_at>=date_trunc('day',${now}::timestamptz at time zone 'UTC') at time zone 'UTC')::integer as account_day,
        count(*) filter(where contact_subject_id=${contact.subjectId} and occurred_at>=date_trunc('day',${now}::timestamptz at time zone 'UTC') at time zone 'UTC')::integer as contact_day,
        max(occurred_at) filter(where actor_user_id=${command.scope.userId} and contact_subject_id=${contact.subjectId} and tribe_id=${command.scope.tribeId}) as last_request
      from public.messaging_usage_events where event_type=${CODE_REQUEST_EVENT.request} and (actor_user_id=${command.scope.userId} or contact_subject_id=${contact.subjectId})
        and occurred_at<=${now} and occurred_at>=least(${hourStart}::timestamptz,date_trunc('day',${now}::timestamptz at time zone 'UTC') at time zone 'UTC')
    `)).rows[0];
    if (counts.account_hour >= MESSAGING_USAGE_LIMIT.codeRequestsHourly || counts.contact_hour >= MESSAGING_USAGE_LIMIT.codeRequestsHourly || counts.account_day >= MESSAGING_USAGE_LIMIT.codeRequestsDaily || counts.contact_day >= MESSAGING_USAGE_LIMIT.codeRequestsDaily || counts.last_request && now.getTime()-new Date(counts.last_request).getTime() < ADMISSION_LIMIT.verificationResendWaitMs) return { allowed: false, code: ADMISSION_ERROR_CODE.usageLimitReached };
    if (diagnostic) {
      const usage = (await this.database.execute<{ hourly: number; daily: number }>(sql`select count(*) filter(where channel=${command.scope.channel} and occurred_at>${hourStart})::integer as hourly,count(*) filter(where occurred_at>=date_trunc('day',${now}::timestamptz at time zone 'UTC') at time zone 'UTC')::integer as daily from public.messaging_usage_events where tribe_id=${command.scope.tribeId} and event_type=${CODE_REQUEST_EVENT.diagnostic} and occurred_at<=${now} and occurred_at>=least(${hourStart}::timestamptz,date_trunc('day',${now}::timestamptz at time zone 'UTC') at time zone 'UTC')`)).rows[0];
      if (usage.hourly >= MESSAGING_USAGE_LIMIT.diagnosticPerChannelHourly || usage.daily >= MESSAGING_USAGE_LIMIT.diagnosticPerTribeDaily) return { allowed: false, code: ADMISSION_ERROR_CODE.usageLimitReached };
    }
    await this.database.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,contact_subject_id,challenge_id,purpose,channel,event_type,operation_id,occurred_at) values (${command.scope.tribeId},${command.scope.userId},${contact.subjectId},${command.challengeId},${command.scope.purpose},${command.scope.channel},${CODE_REQUEST_EVENT.request},${command.operationId},${now})`);
    if (diagnostic) await this.database.execute(sql`insert into public.messaging_usage_events(tribe_id,actor_user_id,contact_subject_id,challenge_id,purpose,channel,event_type,operation_id,occurred_at) values (${command.scope.tribeId},${command.scope.userId},${contact.subjectId},${command.challengeId},${command.scope.purpose},${command.scope.channel},${CODE_REQUEST_EVENT.diagnostic},${command.operationId},${now})`);
    return { allowed: true, replayed: false, ...identity };
  }
}
