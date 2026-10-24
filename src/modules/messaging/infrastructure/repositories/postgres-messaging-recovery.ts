/** Reconciles restored messaging only under current private authority and an external recovery lock. @module postgres-messaging-recovery */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingRecovery, MessagingRecoveryAdmissionEffects, MessagingRecoveryCommand, MessagingRecoveryResult } from "../../domain/repositories/messaging-recovery";
import type { MessagingSecurityFacts } from "../../domain/repositories/messaging-repositories";
import { MessagingRecoveryError } from "../../domain/errors/messaging-recovery-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_RECOVERY } from "../../constants/messaging-recovery";
import { MESSAGING_CONNECTION_STATE } from "../../constants/messaging-connection";
import { MESSAGING_CONNECTION_SECURITY_REASON } from "../../constants/messaging-connection-security";
import { MESSAGING_CONNECTION_REPLACEMENT } from "../../constants/messaging-connection-replacement";
import { MESSAGING_CANDIDATE_IDLE_LIFETIME_MS } from "../../constants/messaging-secret-access";
import { MESSAGE_DELIVERY_STATE } from "../../constants/message-delivery";
import { MESSAGING_KEY_PURPOSE } from "../../constants/messaging-cryptography";
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "@/src/modules/academy-admissions/constants/admission-audit";
import { createAdmissionResourceAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import { PostgresAdmissionAuditRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-audit-repository";
import { appendCancelledMessageDeliveryAudit, type MessageDeliveryAuditRow } from "./postgres-message-delivery-audit";

/** Requires current backend purpose and routing-only external facts; no key importer or provider exists here. */
export type MessagingRecoveryDependencies = {
  execute: <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
  authorize: (database?: RequestDatabase) => Promise<boolean>;
  readSecurityFacts: () => Promise<MessagingSecurityFacts>;
};

/** Commits one bounded batch; it cannot release recovery, reconnect a leader or open admission. */
export class PostgresMessagingRecovery implements MessagingRecovery {
  /** @param dependencies - Actual private backend executor and independent current external control. @param composeAdmission - Admission owner bound to the same original transaction. */
  constructor(private readonly dependencies: MessagingRecoveryDependencies, private readonly composeAdmission: (database: RequestDatabase) => MessagingRecoveryAdmissionEffects) {}

  /** @param command - Operator's expected replacement scope. @param database - Original transaction when acquired. @returns Only while current backend authority and external locked scope agree. */
  private async assertControl(command: MessagingRecoveryCommand, database?: RequestDatabase): Promise<void> {
    if (!await this.dependencies.authorize(database)) throw new MessagingRecoveryError(MESSAGING_ERROR_CODE.permissionDenied);
    if (database) {
      const native = (await database.execute<{ allowed: boolean }>(sql`select public.current_app_user_id() is null and has_function_privilege(current_user,'public.claim_messaging_recovery_scope(uuid)','EXECUTE') as allowed`)).rows[0].allowed;
      if (!native) throw new MessagingRecoveryError(MESSAGING_ERROR_CODE.permissionDenied);
    }
    if (!await this.dependencies.authorize(database)) throw new MessagingRecoveryError(MESSAGING_ERROR_CODE.permissionDenied);
    // External control is the last observation after native and purpose-authority waits.
    const current = await this.dependencies.readSecurityFacts();
    if (!current.recoveryLocked || current.environment !== command.environment || current.securityEpoch !== command.securityEpoch || current.securityEpoch === command.sourceSecurityEpoch) throw new MessagingRecoveryError(MESSAGING_ERROR_CODE.resourceUnavailable);
  }

  /** @param database - Exact currently authorized backend transaction. @param command - Current replacement scope. @returns Work not yet reconciled, including skipped rows and original unsent deliveries only. */
  private async hasMessagingWork(database: RequestDatabase, command: MessagingRecoveryCommand): Promise<boolean> {
    return (await database.execute<{ remaining: boolean }>(sql`select (
      exists(select 1 from public.tenant_messaging_connections where tribe_id=${command.tribeId} and environment=${command.environment} and security_epoch<>${command.securityEpoch} and retired_at is null and (state not in (${MESSAGING_CONNECTION_STATE.suspended},${MESSAGING_CONNECTION_STATE.disconnected}) or is_candidate))
      or exists(select 1 from public.messaging_connection_versions where tribe_id=${command.tribeId} and environment=${command.environment} and security_epoch<>${command.securityEpoch} and retired_at is null)
      or exists(select 1 from public.messaging_secret_envelopes where tribe_id=${command.tribeId} and environment=${command.environment} and security_epoch<>${command.securityEpoch} and retired_at is null)
      or exists(select 1 from public.message_deliveries delivery where delivery.tribe_id=${command.tribeId} and delivery.environment=${command.environment} and delivery.security_epoch<>${command.securityEpoch} and delivery.state=${MESSAGE_DELIVERY_STATE.queued} and not exists(select 1 from public.message_delivery_attempts attempt where attempt.delivery_id=delivery.id))
    ) as remaining`)).rows[0].remaining;
  }

  /** @param command - Current private scope to observe after a completed or unconfirmed original. @returns Current remaining work without mutation or inferred historical counts. */
  async inspect(command: MessagingRecoveryCommand): Promise<{ remaining: boolean }> {
    try {
      await this.assertControl(command);
      return await this.dependencies.execute(async (database) => {
        await this.assertControl(command, database);
        const available = (await database.execute<{ available: boolean }>(sql`select exists(select 1 from public.academy_admission_tribe_namespaces namespace join public.tribes tribe on tribe.id=namespace.tribe_id where namespace.tribe_id=${command.tribeId} and namespace.retired_at is null) as available`)).rows[0].available;
        if (!available) throw new MessagingRecoveryError(MESSAGING_ERROR_CODE.resourceUnavailable);
        const remaining = await this.hasMessagingWork(database, command) || await this.composeAdmission(database).hasWork(command);
        await this.assertControl(command, database);
        return { remaining };
      });
    } catch (error) {
      if (error instanceof MessagingRecoveryError) throw error;
      throw new MessagingRecoveryError(MESSAGING_ERROR_CODE.resourceUnavailable, { cause: error });
    }
  }

  /** @param command - Exact operator-owned source/replacement scope and per-family ceiling. @returns Only counts after the original transaction commits; no retry, provider call, decryption or reopening occurs. */
  async reconcile(command: MessagingRecoveryCommand): Promise<MessagingRecoveryResult> {
    let executionStarted = false;
    try {
      await this.assertControl(command);
      executionStarted = true;
      return await this.dependencies.execute(async (database) => {
        await this.assertControl(command, database);
        if (!(await database.execute<{ claimed: boolean }>(sql`select public.claim_messaging_recovery_scope(${command.tribeId}) as claimed`)).rows[0].claimed) throw new MessagingRecoveryError(MESSAGING_ERROR_CODE.resourceUnavailable);
        await this.assertControl(command, database);
        const now = new Date((await database.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        const connections = (await database.execute<{ id: string; version: number }>(sql`select id,version from public.tenant_messaging_connections where tribe_id=${command.tribeId} and environment=${command.environment} and security_epoch<>${command.securityEpoch} and retired_at is null and state not in (${MESSAGING_CONNECTION_STATE.suspended},${MESSAGING_CONNECTION_STATE.disconnected}) order by id limit ${command.limit} for update skip locked`)).rows;
        for (const connection of connections) await database.execute(sql`update public.tenant_messaging_connections set state=${MESSAGING_CONNECTION_STATE.suspended},state_reason=${MESSAGING_CONNECTION_SECURITY_REASON.securityStop},version=version+1,updated_at=${now} where id=${connection.id} and tribe_id=${command.tribeId} and version=${connection.version}`);
        await this.assertControl(command, database);
        const deliveries = (await database.execute<{ id: string }>(sql`select delivery.id from public.message_deliveries delivery where delivery.tribe_id=${command.tribeId} and delivery.environment=${command.environment} and delivery.security_epoch<>${command.securityEpoch} and delivery.state=${MESSAGE_DELIVERY_STATE.queued} and not exists(select 1 from public.message_delivery_attempts attempt where attempt.delivery_id=delivery.id) order by delivery.id limit ${command.limit} for update of delivery skip locked`)).rows;
        const cancelled: MessageDeliveryAuditRow[] = [];
        for (const delivery of deliveries) cancelled.push(...(await database.execute<MessageDeliveryAuditRow>(sql`update public.message_deliveries set state=${MESSAGE_DELIVERY_STATE.cancelled},last_outcome=${MESSAGING_RECOVERY.cause},lease_token=null,lease_until=null,version=version+1 where id=${delivery.id} and tribe_id=${command.tribeId} and state=${MESSAGE_DELIVERY_STATE.queued} and not exists(select 1 from public.message_delivery_attempts where delivery_id=${delivery.id}) returning id,state,version,connection_id,connection_version,channel`)).rows);
        await appendCancelledMessageDeliveryAudit(database, { tribeId: command.tribeId, actorUserId: null, operationId: null, cause: MESSAGING_RECOVERY.cause, createdAt: now }, cancelled);
        await this.assertControl(command, database);
        const admissionOwner = this.composeAdmission(database), admission = await admissionOwner.reconcile(command);
        await this.assertControl(command, database);
        // Keep native microseconds and an abandoned candidate's original idle cutoff across bounded batches.
        const versionsRetired = (await database.execute<{ id: string }>(sql`with candidates as(select resource.id,case when connection.is_candidate and connection.candidate_version=resource.version and connection.selected_version is distinct from resource.version then least(${now}::timestamptz,resource.last_activity_at+${MESSAGING_CANDIDATE_IDLE_LIFETIME_MS}::bigint*interval '1 millisecond') else ${now}::timestamptz end as retirement_at from public.messaging_connection_versions resource join public.tenant_messaging_connections connection on connection.id=resource.connection_id and connection.tribe_id=resource.tribe_id where resource.tribe_id=${command.tribeId} and resource.environment=${command.environment} and resource.security_epoch<>${command.securityEpoch} and resource.retired_at is null order by resource.id limit ${command.limit} for update of resource skip locked) update public.messaging_connection_versions resource set retired_at=candidates.retirement_at,purge_after=least(coalesce(resource.purge_after,candidates.retirement_at+${MESSAGING_CONNECTION_REPLACEMENT.purgeLifetimeMs}::bigint*interval '1 millisecond'),candidates.retirement_at+${MESSAGING_CONNECTION_REPLACEMENT.purgeLifetimeMs}::bigint*interval '1 millisecond') from candidates where resource.id=candidates.id returning resource.id`)).rows.length;
        const secretsRetired = (await database.execute<{ secret_ref: string }>(sql`with candidates as(select envelope.secret_ref,resource.retired_at,resource.purge_after from public.messaging_secret_envelopes envelope join public.messaging_connection_versions resource on resource.secret_ref=envelope.secret_ref and resource.connection_id=envelope.connection_id and resource.tribe_id=envelope.tribe_id and resource.version=envelope.connection_version where envelope.tribe_id=${command.tribeId} and envelope.environment=${command.environment} and envelope.security_epoch<>${command.securityEpoch} and envelope.retired_at is null and resource.retired_at is not null order by envelope.secret_ref limit ${command.limit} for update of envelope skip locked) update public.messaging_secret_envelopes envelope set retired_at=candidates.retired_at,purge_after=least(coalesce(envelope.purge_after,candidates.purge_after),candidates.purge_after) from candidates where envelope.secret_ref=candidates.secret_ref returning envelope.secret_ref`)).rows.length;
        const candidateSlotsReleased = (await database.execute<{ id: string }>(sql`with candidates as(select connection.id,connection.version from public.tenant_messaging_connections connection join public.messaging_connection_versions resource on resource.connection_id=connection.id and resource.tribe_id=connection.tribe_id and resource.version=connection.candidate_version left join public.messaging_secret_envelopes envelope on envelope.secret_ref=resource.secret_ref where connection.tribe_id=${command.tribeId} and connection.environment=${command.environment} and connection.security_epoch<>${command.securityEpoch} and connection.is_candidate and resource.retired_at is not null and (resource.secret_ref is null or envelope.retired_at is not null) order by connection.id limit ${command.limit} for update of connection skip locked) update public.tenant_messaging_connections connection set is_candidate=false,candidate_version=null,version=connection.version+1,updated_at=${now} from candidates where connection.id=candidates.id and connection.version=candidates.version returning connection.id`)).rows.length;
        await this.assertControl(command, database);
        await new PostgresAdmissionAuditRepository(database).appendMany(connections.map((connection) => createAdmissionResourceAuditEvent({ tribeId: command.tribeId, actorUserId: null, operationId: null, resourceType: ADMISSION_AUDIT_RESOURCE_TYPE.protection, resourceId: connection.id, resourceVersion: connection.version + 1, eventType: MESSAGING_RECOVERY.event, rule: MESSAGING_RECOVERY.operation, cause: MESSAGING_RECOVERY.cause, metadata: { purpose: MESSAGING_KEY_PURPOSE.credential, previousKeyId: null, activeKeyId: null, securityEpoch: command.securityEpoch }, createdAt: now })));
        const remaining = await this.hasMessagingWork(database, command) || await admissionOwner.hasWork(command);
        await this.assertControl(command, database);
        return { ...admission, connectionsSuspended: connections.length, candidateSlotsReleased, versionsRetired, secretsRetired, queuedDeliveriesCancelled: cancelled.length, remaining };
      });
    } catch (error) {
      if (error instanceof MessagingRecoveryError) throw error;
      throw new MessagingRecoveryError(executionStarted ? MESSAGING_ERROR_CODE.operationUnresolved : MESSAGING_ERROR_CODE.resourceUnavailable, { cause: error });
    }
  }
}
