/** Samples only backend counts/states/waits on the already-owned branch. */
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { readPostgresTestDiagnostics } from "./postgres-test-diagnostics";
import { ADMISSION_BACKEND_OBSERVATION as SETTINGS } from "./constants/admission-backend-observation";

/** Contains no query, principal, connection address, PID or application identifier. */
export type AdmissionBackendSnapshot = {
  observedAt: string;
  backends: number;
  unmatchedBackends: number;
  states: Record<string, number>;
  waitClasses: Record<string, number>;
  waitEvents: Record<string, number>;
};
type BackendBucket = { state: string | null; wait_event_type: string | null; wait_event: string | null; amount: number };
type BackendSnapshotRow = { observedAt: string; unmatchedBackends: number; buckets: BackendBucket[] };
/** Retains every bounded sample and any safe metadata failure; observation never substitutes a workload result. */
export type AdmissionBackendObservation = {
  scope: string;
  samples: AdmissionBackendSnapshot[];
  errors: { code: string; sqlStates: string[] }[];
  sampleLimitReached: boolean;
};

/** @param database - Capability restricted to the disposable database. @param applicationName - Exact native workload marker, never emitted. @returns Metadata for matching physical backends and the count of other branch clients. */
export async function readAdmissionBackendSnapshot(database: Pick<AcademyAdmissionTestDatabase, "withContext">, applicationName: string): Promise<AdmissionBackendSnapshot> {
  const row = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<BackendSnapshotRow>(sql`
    with clients as materialized (
      select application_name=${applicationName} as matching,state,wait_event_type,wait_event
      from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid()
    ), buckets as (
      select state,wait_event_type,wait_event,count(*)::integer as amount
      from clients where matching group by state,wait_event_type,wait_event
    )
    select clock_timestamp()::text as "observedAt",
      (select count(*)::integer from clients where not matching) as "unmatchedBackends",
      coalesce(jsonb_agg(buckets),'[]'::jsonb) as buckets from buckets`)).rows[0]);
  const states: Record<string, number> = {}, waitClasses: Record<string, number> = {}, waitEvents: Record<string, number> = {};
  let backends = 0;
  for (const bucket of row.buckets) {
    backends += bucket.amount;
    const state = bucket.state ?? SETTINGS.absentValue, waitClass = bucket.wait_event_type ?? SETTINGS.absentValue, waitEvent = bucket.wait_event ?? SETTINGS.absentValue;
    states[state] = (states[state] ?? 0) + bucket.amount;
    waitClasses[waitClass] = (waitClasses[waitClass] ?? 0) + bucket.amount;
    waitEvents[waitEvent] = (waitEvents[waitEvent] ?? 0) + bucket.amount;
  }
  return { observedAt: row.observedAt, unmatchedBackends: row.unmatchedBackends, backends, states, waitClasses, waitEvents };
}

/** @param database - Independent controller executor on the owned branch. @param applicationName - Workload-only startup marker. @returns A bounded sampler whose stop drains its current real SQL operation before returning. */
export function startAdmissionBackendObservation(database: Pick<AcademyAdmissionTestDatabase, "withContext">, applicationName: string) {
  const observation: AdmissionBackendObservation = { scope: SETTINGS.scope, samples: [], errors: [], sampleLimitReached: false };
  let stopped = false;
  const pending = (async () => {
    while (!stopped && observation.samples.length + observation.errors.length < SETTINGS.maximumSamples) {
      try { observation.samples.push(await readAdmissionBackendSnapshot(database, applicationName)); }
      catch (error) { observation.errors.push({ code: SETTINGS.failureCode, sqlStates: readPostgresTestDiagnostics(error).sqlStates }); }
      if (!stopped) await delay(SETTINGS.pollMs);
    }
    observation.sampleLimitReached = observation.samples.length + observation.errors.length >= SETTINGS.maximumSamples;
  })();
  return {
    latest: () => observation.samples.at(-1),
    async stop(): Promise<AdmissionBackendObservation> { stopped = true; await pending; return observation; },
  };
}
