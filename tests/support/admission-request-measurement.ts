/** Shared per-request database measurement for native admission suites that run behind the `admission-query-counter.mjs` preload. @module admission-request-measurement */
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AdmissionNextServerOptions, AdmissionRequestQueryCount } from "./admission-next-server";
import { ADMISSION_REQUEST_MEASUREMENT } from "./constants/admission-request-measurement";

/** Numeric fields summarized by median for every measured label. */
const MEASURED_FIELDS = ["durationMs", "checkouts", "transactions", "commits", "rollbacks", "queries", "statements", "sequentialRoundTrips", "pending"] as const;
type MeasuredField = (typeof MEASURED_FIELDS)[number];

/** One measured request label: the median of its samples and every sample for the evidence report. */
export type MeasuredAdmissionRequest = { label: string; median: Record<MeasuredField, number>; samples: AdmissionRequestQueryCount[] };
/** One request of a measured label; every sample may target its own resource path, body and caller. */
export type AdmissionMeasurementSample = { path: string; body?: object; cookie?: string; headers?: Readonly<Record<string, string>> };
/** Maximum median transactions, statements and sequential round trips accepted for one label. */
export type AdmissionRequestBudget = { transactions: number; queries: number; sequentialRoundTrips: number };

/** @param samples - Observations of one request label. @returns The median of every field; with an even count, the mean of the two central samples rounded down. */
function summarize(samples: readonly AdmissionRequestQueryCount[]): MeasuredAdmissionRequest["median"] {
  return Object.fromEntries(MEASURED_FIELDS.map((field) => {
    const sorted = samples.map((sample) => sample[field]).sort((left, right) => left - right);
    const upper = Math.floor(sorted.length / 2);
    return [field, sorted.length % 2 === 1 ? sorted[upper] : Math.floor((sorted[upper - 1] + sorted[upper]) / 2)];
  })) as MeasuredAdmissionRequest["median"];
}

/** @param token - Raw fixture session token held only in memory. @param secret - Generated per-server Better Auth signing secret. @param sign - Better Auth signer. @returns The signed session cookie header value. */
export async function signedAdmissionSessionCookie(token: string, secret: string, sign: (value: string, secret: string) => Promise<string>): Promise<string> {
  return `better-auth.session_token=${encodeURIComponent(`${token}.${await sign(token, secret)}`)}`;
}

/** @param onQueryCount - Receives each preload observation. @param options - Extra server options (other preloads, environment, callbacks). @returns Server options that load the counter preload first and forward its observations. */
export function withAdmissionQueryCounter(onQueryCount: (observation: AdmissionRequestQueryCount) => void, options: AdmissionNextServerOptions = {}): AdmissionNextServerOptions {
  return { ...options, preloadModules: [join(process.cwd(), ADMISSION_REQUEST_MEASUREMENT.counterPreload), ...(options.preloadModules ?? [])], onQueryCount };
}

/**
 * Creates the observation sink of one native measurement run; `connect` binds it to the server once it is listening.
 *
 * @param redactions - Fixture identifiers replaced by stable placeholders in reported paths and failures.
 * @returns The sink, the measured labels, the evidence report and the request driver factory.
 */
export function createAdmissionRequestMeasurement(redactions: Readonly<Record<string, string>>) {
  const observations: AdmissionRequestQueryCount[] = [], measured: MeasuredAdmissionRequest[] = [], known = new Map(Object.entries(redactions));
  /** @param path - Request path. @returns The path with fixture identifiers replaced. */
  const redact = (path: string) => [...known].reduce((current, [value, placeholder]) => current.split(value).join(placeholder), path);
  /** @param method - HTTP method. @param path - Observed path without query. @returns The preload's report for the request just completed. */
  const observe = async (method: string, path: string) => {
    for (let attempt = 0; attempt < ADMISSION_REQUEST_MEASUREMENT.observationPolls; attempt += 1) {
      const index = observations.findIndex((observation) => observation.method === method && observation.path === path);
      if (index >= 0) return observations.splice(index, 1)[0];
      await delay(ADMISSION_REQUEST_MEASUREMENT.observationPollMs);
    }
    throw new Error(`Admission request query count missing: ${method} ${redact(path)}`);
  };

  /**
   * @param server - Loopback origin and the default caller's signed cookie.
   * @returns `send` for unreported setup requests and `measure` for reported labels.
   */
  const connect = (server: { origin: string; cookie?: string }) => {
    /** @param method - HTTP method. @param sample - Path, JSON body and optional caller. @returns The consumed response status and text, once the preload reported it so it never leaks into a later sample. */
    const send = async (method: string, sample: AdmissionMeasurementSample) => {
      const cookie = sample.cookie ?? server.cookie;
      const response = await fetch(`${server.origin}${sample.path}`, { method, redirect: "manual", headers: { origin: server.origin, ...(cookie ? { cookie } : {}), ...(sample.body ? { "content-type": "application/json" } : {}), ...sample.headers }, ...(sample.body ? { body: JSON.stringify(sample.body) } : {}), signal: AbortSignal.timeout(ADMISSION_REQUEST_MEASUREMENT.requestTimeoutMs) });
      const text = await response.text();
      return { status: response.status, text, observation: await observe(method, sample.path.split("?")[0]) };
    };
    /**
     * @param label - Report and budget label; repeating a label appends samples to it.
     * @param method - HTTP method.
     * @param samples - One request per sample; a state-changing command passes one fresh body per sample.
     * @param expectedStatuses - Accepted response statuses; anything else fails naming the label.
     * @returns The response texts, for samples whose result feeds a later step.
     */
    const measure = async (label: string, method: string, samples: readonly AdmissionMeasurementSample[], expectedStatuses: readonly number[] = [200]) => {
      const entry = measured.find((candidate) => candidate.label === label) ?? measured[measured.push({ label, samples: [], median: summarize([]) }) - 1];
      const texts: string[] = [];
      for (const sample of samples) {
        const { status, text, observation } = await send(method, sample);
        if (!expectedStatuses.includes(status)) throw new Error(`Admission measurement ${label} answered ${status}: ${redact(text.slice(0, ADMISSION_REQUEST_MEASUREMENT.failureBodyLength))}`);
        texts.push(text);
        entry.samples.push({ ...observation, path: redact(sample.path) });
      }
      entry.median = summarize(entry.samples);
      return texts;
    };
    return { send, measure };
  };

  /** @returns The JSON evidence rows: medians plus the compact samples. */
  const report = () => measured.map(({ label, median, samples }) => ({ label, ...median, samples: samples.map(({ durationMs, checkouts, transactions, queries, sequentialRoundTrips }) => ({ durationMs, checkouts, transactions, queries, sequentialRoundTrips })) }));
  /** @param value - Identifier learned during the run, such as an invitation token. @param placeholder - Its stable replacement. */
  const addRedaction = (value: string, placeholder: string) => { known.set(value, placeholder); };
  return { measured, report, connect, addRedaction, onQueryCount: (observation: AdmissionRequestQueryCount) => { observations.push(observation); } };
}

/**
 * @param measured - Medians of one run.
 * @param budget - Accepted maxima per label; every measured label must have one.
 * @returns The labels that are unbudgeted, exceed any limit or left a statement pending after the settle window (an incomplete count), with their medians, so an assertion against `[]` names the regression.
 */
export function findAdmissionBudgetOverruns(measured: readonly MeasuredAdmissionRequest[], budget: Readonly<Record<string, AdmissionRequestBudget>>) {
  return measured.flatMap(({ label, median, samples }) => {
    const limit = budget[label], actual = { transactions: median.transactions, queries: median.queries, sequentialRoundTrips: median.sequentialRoundTrips };
    if (!limit) return [{ label, reason: "unbudgeted", actual }];
    const pending = samples.reduce((total, sample) => total + sample.pending, 0);
    if (pending > 0) return [{ label, reason: "pending_queries", actual, pending }];
    return limit.transactions < actual.transactions || limit.queries < actual.queries || limit.sequentialRoundTrips < actual.sequentialRoundTrips ? [{ label, reason: "over_budget", actual, limit }] : [];
  });
}
