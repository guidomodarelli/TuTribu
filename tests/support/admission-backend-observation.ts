/** Samples only backend counts/states/waits on the already-owned branch. */
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { readPostgresTestDiagnostics } from "./postgres-test-diagnostics";
import { ADMISSION_BACKEND_OBSERVATION as SETTINGS } from "./constants/admission-backend-observation";

/** Counts lock inventory without emitting object identifiers or backend identities. */
export type AdmissionBackendLockSnapshot = {
  fastPathRelationLocks: number;
  mainTableRelationLocks: number;
  maximumRelationsPerBackend: number;
  backendsWithRelationLocks: number;
  waitingLocks: number;
  lockTypes: Record<string, number>;
  relationModes: Record<string, number>;
};

/** Contains no query, principal, connection address, PID or application identifier. */
export type AdmissionBackendSnapshot = {
  observedAt: string;
  backends: number;
  unmatchedBackends: number;
  states: Record<string, number>;
  waitClasses: Record<string, number>;
  waitEvents: Record<string, number>;
  locks?: AdmissionBackendLockSnapshot;
};
type BackendBucket = { state: string | null; wait_event_type: string | null; wait_event: string | null; amount: number };
type BackendSnapshotRow = { observedAt: string; unmatchedBackends: number; buckets: BackendBucket[]; locks?: AdmissionBackendLockSnapshot };
/** Retains every bounded sample and any safe metadata failure; observation never substitutes a workload result. */
export type AdmissionBackendObservation = {
  scope: string;
  lockInventoryEnabled: boolean;
  samples: AdmissionBackendSnapshot[];
  errors: { code: string; sqlStates: string[] }[];
  sampleLimitReached: boolean;
};

/** @param database - Capability restricted to the disposable database. @param applicationName - Exact native workload marker, never emitted. @param includeLocks - Explicit diagnostic inventory; the default never queries pg_locks. @returns Metadata for matching physical backends and the count of other branch clients. */
export async function readAdmissionBackendSnapshot(database: Pick<AcademyAdmissionTestDatabase, "withContext">, applicationName: string, includeLocks = false): Promise<AdmissionBackendSnapshot> {
  const lockInventory = includeLocks ? sql`, owned_locks as materialized (
    select native_lock.pid,native_lock.locktype,native_lock.mode,native_lock.relation,
      native_lock.granted,native_lock.fastpath
    from pg_locks native_lock join clients on clients.pid=native_lock.pid
    where clients.matching
  ), backend_relations as (
    select pid,count(distinct relation)::integer as amount
    from owned_locks where locktype='relation' group by pid
  ), lock_types as (
    select locktype,count(*)::integer as amount from owned_locks group by locktype
  ), relation_modes as (
    select mode,count(*)::integer as amount from owned_locks where locktype='relation' group by mode
  )` : sql``;
  const lockProjection = includeLocks ? sql`, (
    select jsonb_build_object(
      'fastPathRelationLocks',count(*) filter (where locktype='relation' and fastpath)::integer,
      'mainTableRelationLocks',count(*) filter (where locktype='relation' and not fastpath)::integer,
      'maximumRelationsPerBackend',coalesce((select max(amount) from backend_relations),0),
      'backendsWithRelationLocks',(select count(*)::integer from backend_relations),
      'waitingLocks',count(*) filter (where not granted)::integer,
      'lockTypes',coalesce((select jsonb_object_agg(locktype,amount) from lock_types),'{}'::jsonb),
      'relationModes',coalesce((select jsonb_object_agg(mode,amount) from relation_modes),'{}'::jsonb)
    ) from owned_locks
  ) as locks` : sql``;
  const row = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<BackendSnapshotRow>(sql`
    with clients as materialized (
      select pid,application_name=${applicationName} as matching,state,wait_event_type,wait_event
      from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid()
    ), buckets as (
      select state,wait_event_type,wait_event,count(*)::integer as amount
      from clients where matching group by state,wait_event_type,wait_event
    ) ${lockInventory}
    select clock_timestamp()::text as "observedAt",
      (select count(*)::integer from clients where not matching) as "unmatchedBackends",
      coalesce(jsonb_agg(buckets),'[]'::jsonb) as buckets ${lockProjection} from buckets`)).rows[0]);
  if (includeLocks && !row.locks) throw new Error(SETTINGS.missingLockSnapshotCode);
  const states: Record<string, number> = {}, waitClasses: Record<string, number> = {}, waitEvents: Record<string, number> = {};
  let backends = 0;
  for (const bucket of row.buckets) {
    backends += bucket.amount;
    const state = bucket.state ?? SETTINGS.absentValue, waitClass = bucket.wait_event_type ?? SETTINGS.absentValue, waitEvent = bucket.wait_event ?? SETTINGS.absentValue;
    states[state] = (states[state] ?? 0) + bucket.amount;
    waitClasses[waitClass] = (waitClasses[waitClass] ?? 0) + bucket.amount;
    waitEvents[waitEvent] = (waitEvents[waitEvent] ?? 0) + bucket.amount;
  }
  return { observedAt: row.observedAt, unmatchedBackends: row.unmatchedBackends, backends, states, waitClasses, waitEvents, ...(includeLocks ? { locks: row.locks } : {}) };
}

/** @param database - Independent controller executor on the owned branch. @param applicationName - Workload-only startup marker. @param includeLocks - Explicit lock inventory with a slower poll interval. @returns A bounded sampler whose stop drains its current real SQL operation before returning. */
export function startAdmissionBackendObservation(database: Pick<AcademyAdmissionTestDatabase, "withContext">, applicationName: string, includeLocks = false) {
  const observation: AdmissionBackendObservation = { scope: SETTINGS.scope, lockInventoryEnabled: includeLocks, samples: [], errors: [], sampleLimitReached: false };
  let stopped = false;
  const pending = (async () => {
    while (!stopped && observation.samples.length + observation.errors.length < SETTINGS.maximumSamples) {
      try { observation.samples.push(await readAdmissionBackendSnapshot(database, applicationName, includeLocks)); }
      catch (error) { observation.errors.push({ code: SETTINGS.failureCode, sqlStates: readPostgresTestDiagnostics(error).sqlStates }); }
      if (!stopped) await delay(includeLocks ? SETTINGS.lockPollMs : SETTINGS.pollMs);
    }
    observation.sampleLimitReached = observation.samples.length + observation.errors.length >= SETTINGS.maximumSamples;
  })();
  return {
    latest: () => observation.samples.at(-1),
    async stop(): Promise<AdmissionBackendObservation> { stopped = true; await pending; return observation; },
  };
}
