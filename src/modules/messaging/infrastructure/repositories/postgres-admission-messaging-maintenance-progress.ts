/** Persists a bounded private workflow with fair turns and authoritative native health. @module postgres-admission-messaging-maintenance-progress */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import type { AdmissionMessagingMaintenanceBeginning, AdmissionMessagingMaintenanceExternalScope, AdmissionMessagingMaintenanceFinish, AdmissionMessagingMaintenanceHealth, AdmissionMessagingMaintenancePhaseSnapshot, AdmissionMessagingMaintenanceProgress, AdmissionMessagingMaintenanceRun } from "../../domain/repositories/admission-messaging-maintenance";
import { AdmissionMessagingMaintenanceError } from "../../domain/errors/admission-messaging-maintenance-error";
import { sameAdmissionMaintenanceExternalScope } from "../../domain/policies/admission-messaging-maintenance-scope";
import { ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS, ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION, ADMISSION_MESSAGING_MAINTENANCE_PHASES, ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS, ADMISSION_MESSAGING_MAINTENANCE_REASON, ADMISSION_MESSAGING_MAINTENANCE_RUNNING_PHASE, ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS, ADMISSION_MESSAGING_MAINTENANCE_STORAGE, ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE } from "../../constants/admission-messaging-maintenance";
import { MESSAGE_DELIVERY_STATE } from "../../constants/message-delivery";
import { admissionMaintenanceCompleted, createUnstartedAdmissionMaintenancePhases } from "../../application/use-cases/admission-messaging-maintenance-state";
import { admissionMaintenanceExternalScope, admissionMaintenanceRun, projectStoredAdmissionMaintenancePhases, type AdmissionMessagingMaintenanceRow } from "./admission-messaging-maintenance-mapper";

/** @param current - Original row read in the caller's transaction. @param run - Exact original acquisition. @throws AdmissionMessagingMaintenanceError unless that same run may still start work. */
function assertAdmissionMaintenanceLeaseLive(current: AdmissionMessagingMaintenanceRow | null, run: AdmissionMessagingMaintenanceRun): void {
  if (!current || current.run_id !== run.runId || current.state !== ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.running) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved);
  if (!current.deadline_live || !current.lease_live || current.deadline_reached) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached);
}

/** Owns each short commit-confirming metadata or business transaction without a nested checkout. */
export type AdmissionMessagingMaintenanceExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Observations do not need optional message keyrings, provider clients or a human principal. */
export class PostgresAdmissionMessagingMaintenanceProgress implements AdmissionMessagingMaintenanceProgress {
  /** @param execute - Existing guarded privileged executor. @param authorize - Current native backend bearer. @param readRecoveryLock - Key-independent current recovery stop. @param readExternalScope - Local key-independent hosting facts or explicit missing configuration. @param now - Host clock sampled at the actual SQL receipt, before final waits. */
  constructor(private readonly execute: AdmissionMessagingMaintenanceExecutor, private readonly authorize: () => Promise<boolean>, private readonly readRecoveryLock: () => Promise<boolean>, private readonly readExternalScope: () => Promise<AdmissionMessagingMaintenanceExternalScope | null>, private readonly now: () => number = Date.now) {}

  /** @param expected - Original external scope, when already acquired. @returns Only while live backend authority, restore state and the original scope remain current. */
  private async guard(expected?: AdmissionMessagingMaintenanceExternalScope | null): Promise<void> {
    if (!await this.authorize()) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable);
    if (await this.readRecoveryLock()) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.recoveryLocked);
    if (expected !== undefined && !sameAdmissionMaintenanceExternalScope(expected, await this.readExternalScope())) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.recoveryLocked);
    if (!await this.authorize()) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable);
  }

  /** @param database - Original owner transaction. @param lock - Row lock taken by this same statement, saving a separate locking round trip. @returns Minimal native columns, or genuine absence; no PostgreSQL schema validator is applied. */
  private async row(database: RequestDatabase, lock: "update" | "share" | null = null): Promise<AdmissionMessagingMaintenanceRow | null> {
    const locking = lock === "update" ? sql`for update` : lock === "share" ? sql`for share` : sql``;
    return (await database.execute<AdmissionMessagingMaintenanceRow>(sql`select run_id,version,state,external_environment,external_security_epoch,first_phase,next_phase,
      (extract(epoch from started_at)*${MILLISECONDS_PER_SECOND})::bigint::text as started_milliseconds,
      (extract(epoch from last_successful_at)*${MILLISECONDS_PER_SECOND})::bigint::text as last_successful_milliseconds,
      lease_until>clock_timestamp() as lease_live,deadline_at>clock_timestamp() as deadline_live,deadline_reached,phases
      from public.admission_messaging_maintenance_progress where scope=${ADMISSION_MESSAGING_MAINTENANCE_STORAGE.scope} ${locking}`)).rows[0] ?? null;
  }

  /** @param database - Original metadata transaction. @param row - Actual current native workflow. @returns A single indexed oldest-queue observation, without contacts or an unbounded queue count. */
  private async health(database: RequestDatabase, row: AdmissionMessagingMaintenanceRow): Promise<AdmissionMessagingMaintenanceHealth> {
    const observed = (await database.execute<{ observed: string; oldest: string | null; age: string | null }>(sql`with observation as (select clock_timestamp() as instant), oldest as (
      select created_at from public.message_deliveries where state=${MESSAGE_DELIVERY_STATE.queued} order by created_at,id limit 1)
      select (extract(epoch from observation.instant)*${MILLISECONDS_PER_SECOND})::bigint::text as observed,
        (extract(epoch from oldest.created_at)*${MILLISECONDS_PER_SECOND})::bigint::text as oldest,
        case when oldest.created_at is null then null else greatest(0,ceil(extract(epoch from observation.instant-oldest.created_at)*${MILLISECONDS_PER_SECOND}))::bigint::text end as age
      from observation left join oldest on true`)).rows[0];
    return { available: true, observedAtMilliseconds: Number(observed.observed), lastSuccessfulRunAtMilliseconds: row.last_successful_milliseconds === null ? null : Number(row.last_successful_milliseconds), oldestQueuedAtMilliseconds: observed.oldest === null ? null : Number(observed.oldest), queueAgeMilliseconds: observed.age === null ? null : Number(observed.age) };
  }

  /** @param database - Original transaction. @param run - Exact original acquired workflow. @param forShare - Pins the lease across a DB-only business effect when true. @returns Only while the original private run still authorizes starting work; no provider call is made here. */
  async guardWorkTransaction(database: RequestDatabase, run: AdmissionMessagingMaintenanceRun, forShare = true): Promise<void> {
    await this.guard(run.externalScope);
    // One statement both pins the lease (when requested) and samples it with a fresh SQL clock.
    assertAdmissionMaintenanceLeaseLive(await this.row(database, forShare ? "share" : null), run);
    await this.guard(run.externalScope);
  }

  /** @param run - Original private workflow. @returns After a short current-lease check; callers release this transaction before provider RPC. */
  async assertRunnable(run: AdmissionMessagingMaintenanceRun): Promise<void> {
    try { await this.execute((database) => this.guardWorkTransaction(database, run)); }
    catch (error) { if (error instanceof AdmissionMessagingMaintenanceError) throw error; throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved, { cause: error }); }
  }

  /** @param runId - Fresh server correlation. @returns The confirmed original fair acquisition or the actual existing original, never an assumed acquisition after a lost commit response. */
  async begin(runId: string): Promise<AdmissionMessagingMaintenanceBeginning> {
    try {
      await this.guard();
      const scope = await this.readExternalScope();
      await this.guard(scope);
      return await this.execute(async (database) => {
        await this.guard(scope);
        const inserted = (await database.execute(sql`insert into public.admission_messaging_maintenance_progress(scope,run_id,external_environment,external_security_epoch,phases)
          values (${ADMISSION_MESSAGING_MAINTENANCE_STORAGE.scope},${runId},${scope?.environment ?? null},${scope?.securityEpoch ?? null},${JSON.stringify(createUnstartedAdmissionMaintenancePhases())}::jsonb)
          on conflict(scope) do nothing returning scope`)).rows.length > 0;
        let current = (await this.row(database, "update"))!;
        let clockObserved = this.now();
        await this.guard(scope);
        const sameScope = sameAdmissionMaintenanceExternalScope(admissionMaintenanceExternalScope(current), scope);
        if (!sameScope && current.run_id === runId) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.recoveryLocked);
        if (!inserted && (current.run_id === runId || sameScope && current.state === ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.running && current.lease_live)) {
          const health = await this.health(database, current);
          await this.guard(scope);
          return { acquired: false, existingRunId: current.run_id, existingStatus: current.state === ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.running ? ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.busy : current.state, deadlineReached: current.deadline_reached || current.state === ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.running && !current.deadline_live, phases: projectStoredAdmissionMaintenancePhases(current.phases), health };
        }
        if (!inserted) {
          await database.execute(sql`update public.admission_messaging_maintenance_progress set version=version+1,run_id=${runId},state=${ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.running},external_environment=${scope?.environment ?? null},external_security_epoch=${scope?.securityEpoch ?? null},phases=${JSON.stringify(createUnstartedAdmissionMaintenancePhases())}::jsonb where scope=${ADMISSION_MESSAGING_MAINTENANCE_STORAGE.scope}`);
          current = (await this.row(database))!;
          clockObserved = this.now();
        }
        const health = await this.health(database, current);
        await this.guard(scope);
        return { acquired: true, run: admissionMaintenanceRun(current, health, clockObserved) };
      });
    } catch (error) { if (error instanceof AdmissionMessagingMaintenanceError) throw error; throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved, { cause: error }); }
  }

  /**
   * A `running` observation is the authority to start that phase: it is only accepted while the original lease and native deadline are live.
   * @param run - Original acquired workflow.
   * @param phase - Original started/settled phase observation.
   * @param next - Optional next phase starting in the same commit; settling one phase and starting the next share one transaction.
   * @returns After the exact own observations commit; duplicates preserve their original version and completed runs stay immutable.
   */
  async recordPhase(run: AdmissionMessagingMaintenanceRun, phase: AdmissionMessagingMaintenancePhaseSnapshot, next?: AdmissionMessagingMaintenancePhaseSnapshot): Promise<void> {
    const requested = next ? [phase, next] : [phase];
    if (requested.some((value) => !ADMISSION_MESSAGING_MAINTENANCE_PHASES.includes(value.phase)) || next?.phase === phase.phase) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.phaseFailed);
    const snapshots = requested.map((value) => ({ ...projectStoredAdmissionMaintenancePhases([value])[0], observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded }));
    const starting = requested.some((value) => value.status === ADMISSION_MESSAGING_MAINTENANCE_RUNNING_PHASE);
    try {
      await this.guard(run.externalScope);
      await this.execute(async (database) => {
        const current = await this.row(database, "update");
        await this.guard(run.externalScope);
        if (!current || current.run_id !== run.runId || !sameAdmissionMaintenanceExternalScope(admissionMaintenanceExternalScope(current), run.externalScope)) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved);
        if (starting) assertAdmissionMaintenanceLeaseLive(current, run);
        let phases = sql`phases`, changed = false;
        for (const [index, snapshot] of snapshots.entries()) {
          const position = current.phases.findIndex((stored) => stored.phase === snapshot.phase);
          if (position < 0) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved);
          const original = current.phases[position];
          if (JSON.stringify(projectStoredAdmissionMaintenancePhases([original])[0]) === JSON.stringify(snapshot)) continue;
          const late = requested[index].late;
          if (current.state === ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.completed || current.state !== ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.running && !late || original.observation === ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded && original.status !== ADMISSION_MESSAGING_MAINTENANCE_RUNNING_PHASE && !(late && original.status === ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.unresolved)) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved);
          phases = sql`jsonb_set(${phases},array[${String(position)}]::text[],${JSON.stringify(snapshot)}::jsonb,false)`;
          changed = true;
        }
        if (changed) await database.execute(sql`update public.admission_messaging_maintenance_progress set version=version+1,phases=${phases} where scope=${ADMISSION_MESSAGING_MAINTENANCE_STORAGE.scope}`);
        await this.guard(run.externalScope);
      });
    } catch (error) { if (error instanceof AdmissionMessagingMaintenanceError) throw error; throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved, { cause: error }); }
  }

  /** @param run - Exact original acquisition. @param phases - Explicit original counts and missing phases. @param deadlineReached - Sticky host deadline evidence. @param observationBudgetMilliseconds - Conservative original host/SQL-clock budget, never extended. @returns Native classification and health after confirmed persistence; replay never advances success time. */
  async finish(run: AdmissionMessagingMaintenanceRun, phases: readonly AdmissionMessagingMaintenancePhaseSnapshot[], deadlineReached: boolean, observationBudgetMilliseconds: number = ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS): Promise<AdmissionMessagingMaintenanceFinish> {
    if (!Number.isInteger(observationBudgetMilliseconds) || observationBudgetMilliseconds < 0 || observationBudgetMilliseconds > ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable);
    try {
      await this.guard(run.externalScope);
      return await this.execute(async (database) => {
        let current = await this.row(database, "update");
        await this.guard(run.externalScope);
        if (!current || current.run_id !== run.runId || !sameAdmissionMaintenanceExternalScope(admissionMaintenanceExternalScope(current), run.externalScope)) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved);
        const projected = projectStoredAdmissionMaintenancePhases(phases);
        if (current.state === ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.running) {
          const state = admissionMaintenanceCompleted(projected, deadlineReached) ? ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.completed : ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.incomplete;
          await database.execute(sql`update public.admission_messaging_maintenance_progress set version=version+1,state=${state},phases=${JSON.stringify(projected)}::jsonb,deadline_reached=deadline_reached or ${deadlineReached},deadline_at=least(deadline_at,started_at+${observationBudgetMilliseconds}*interval '1 millisecond') where scope=${ADMISSION_MESSAGING_MAINTENANCE_STORAGE.scope}`);
          current = (await this.row(database))!;
        } else {
          const identical = (await database.execute<{ identical: boolean }>(sql`select phases=${JSON.stringify(projected)}::jsonb as identical from public.admission_messaging_maintenance_progress where scope=${ADMISSION_MESSAGING_MAINTENANCE_STORAGE.scope}`)).rows[0].identical;
          if (!identical) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved);
        }
        const health = await this.health(database, current);
        await this.guard(run.externalScope);
        return { health, completed: current.state === ADMISSION_MESSAGING_MAINTENANCE_STORED_STATE.completed, deadlineReached: current.deadline_reached };
      });
    } catch (error) { if (error instanceof AdmissionMessagingMaintenanceError) throw error; throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved, { cause: error }); }
  }
}
