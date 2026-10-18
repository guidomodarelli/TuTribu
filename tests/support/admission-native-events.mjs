/** Own process protocol for passive native events, with no speech or focus actions. */
import { spawn } from "node:child_process";
import { z } from "zod";
import { ADMISSION_READER_EVENTS as EVENTS } from "./constants/admission-reader-events.mjs";
import { ADMISSION_READER_PROBE } from "./constants/admission-reader-probe.mjs";

const count = z.number().int().nonnegative();
const groupSchema = z.object({ eventType: z.enum(EVENTS.eventTypes), toolkit: z.enum(EVENTS.toolkitFamilies), roleId: count, liveRegion: z.boolean(), payloadIsText: z.boolean(), expectedTextInPayload: z.boolean(), maximumDataLength: count.max(EVENTS.maximumDataLength), count: count.positive() }).strict().refine((group) => !group.expectedTextInPayload || group.payloadIsText, "Expected text requires a textual payload");
const observationSchema = z.object({ registeredEvents: z.array(z.enum(EVENTS.eventTypes)), completion: z.enum([EVENTS.completions.stopped, EVENTS.completions.deadline]), observedEvents: count, readFailures: count, droppedEvents: count, groups: z.array(groupSchema).max(EVENTS.maximumGroups) }).strict().refine((value) => JSON.stringify(value.registeredEvents) === JSON.stringify(EVENTS.eventTypes), "Native event scope differs from registration").refine((value) => value.groups.reduce((total, group) => total + group.count, value.droppedEvents) === value.observedEvents, "Native event totals are inconsistent").refine((value) => new Set(value.groups.map((group) => JSON.stringify([group.eventType, group.toolkit, group.roleId, group.liveRegion, group.payloadIsText, group.expectedTextInPayload]))).size === value.groups.length, "Native event groups must be unique");

class NativeEventObserverError extends Error {
  /** @param {string} code - Closed diagnostic failure. @param {unknown} [cause] - Original private cause. */
  constructor(code, cause) { super(`AdmissionNativeEvents.observe failed: ${code}`, { cause }); this.code = code; }
}

/** @param {string} serialized - Own worker report, never a provider payload. @returns The observed metadata. */
export function parseAdmissionNativeEventObservation(serialized) {
  try {
    const observed = observationSchema.parse(JSON.parse(serialized));
    return { ...observed, expectedTextSignals: observed.groups.reduce((total, group) => total + (group.expectedTextInPayload ? group.count : 0), 0), complete: observed.readFailures === 0 && observed.droppedEvents === 0 && observed.completion === EVENTS.completions.stopped };
  } catch (error) { throw new NativeEventObserverError(EVENTS.failures.protocol, error); }
}

/**
 * Starts a passive SDK subscriber on the disposable display before the synthetic native action.
 * @param {string} expected - Exact generated canary status; real contacts and credentials are rejected.
 * @returns A bounded owner whose stop result contains only validated counts, enums and flags.
 */
export async function startAdmissionNativeEventObservation(expected) {
  if (process.platform !== "linux" || process.env.GITHUB_ACTIONS !== "true" || !process.env.DISPLAY) throw new NativeEventObserverError(EVENTS.failures.platform);
  const prefix = ADMISSION_READER_PROBE.statusPrefix + " ";
  if (!expected.startsWith(prefix) || !EVENTS.caseIdentifierPattern.test(expected.slice(prefix.length))) throw new NativeEventObserverError(EVENTS.failures.input);
  const configuration = { application: EVENTS.application, eventTypes: EVENTS.eventTypes, toolkits: EVENTS.toolkits, defaultToolkit: EVENTS.defaultToolkit, phases: EVENTS.phases, completions: EVENTS.completions, durationMs: EVENTS.durationMs, queryTimeoutMs: ADMISSION_READER_PROBE.accessibilityTimeoutMs, maximumGroups: EVENTS.maximumGroups, maximumDataLength: EVENTS.maximumDataLength };
  const child = spawn("/usr/bin/python3", [EVENTS.script, expected, JSON.stringify(configuration)], { stdio: ["ignore", "pipe", "pipe"] });
  let pending = "", outputBytes = 0, closedAlready = false, readyObserved = false;
  /** @type {ReturnType<typeof parseAdmissionNativeEventObservation>|undefined} */
  let observation;
  /** @type {NativeEventObserverError|undefined} */
  let failure;
  /** @type {()=>void} */
  let resolveReady;
  /** @type {(error:unknown)=>void} */
  let rejectReady;
  /** @type {()=>void} */
  let resolveClosed;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  /** @param {NativeEventObserverError} error - Safe own failure while its cause remains private. */
  function fail(error) { failure ??= error; rejectReady(error); child.kill("SIGTERM"); }
  child.once("error", (error) => fail(new NativeEventObserverError(EVENTS.failures.start, error)));
  child.once("close", () => { closedAlready = true; resolveClosed(); if (!readyObserved) rejectReady(failure ?? new NativeEventObserverError(EVENTS.failures.start)); });
  child.stderr.resume();
  child.stdout.on("data", (bytes) => {
    outputBytes += bytes.length;
    if (outputBytes > EVENTS.maximumOutputBytes) { fail(new NativeEventObserverError(EVENTS.failures.output)); return; }
    pending += bytes.toString("utf8");
    const lines = pending.split(/\r?\n/u); pending = lines.pop() ?? "";
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (message.phase === EVENTS.phases.ready && Object.keys(message).length === 1 && !readyObserved) { readyObserved = true; resolveReady(); }
        else if (message.phase === EVENTS.phases.completed && Object.keys(message).length === 2 && !observation) observation = parseAdmissionNativeEventObservation(JSON.stringify(message.observation));
        else throw new NativeEventObserverError(EVENTS.failures.protocol);
      } catch (error) { fail(error instanceof NativeEventObserverError ? error : new NativeEventObserverError(EVENTS.failures.protocol, error)); }
    }
  });
  const readyTimer = setTimeout(() => fail(new NativeEventObserverError(EVENTS.failures.start)), EVENTS.readyTimeoutMs);
  readyTimer.unref();
  /** @returns After process exit, otherwise an explicit bounded stop failure. */
  async function confirmExit() {
    let timer;
    const limit = new Promise((_, reject) => { timer = setTimeout(() => { child.kill("SIGKILL"); reject(new NativeEventObserverError(EVENTS.failures.stop)); }, EVENTS.stopTimeoutMs); timer.unref(); });
    try { await Promise.race([closed, limit]); }
    finally { clearTimeout(timer); }
  }
  try { await ready; }
  catch (error) {
    child.kill("SIGKILL");
    try { await confirmExit(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "AdmissionNativeEvents.start failed: process_exit_unconfirmed", { cause: error }); }
    throw error;
  }
  finally { clearTimeout(readyTimer); }
  /** @type {Promise<ReturnType<typeof parseAdmissionNativeEventObservation>>|undefined} */
  let stopResult;
  return {
    stop() {
      stopResult ??= (async () => {
        if (!closedAlready) child.kill("SIGTERM");
        await confirmExit();
        if (failure) throw failure;
        if (child.exitCode !== 0) throw new NativeEventObserverError(EVENTS.failures.stop);
        if (!observation) throw new NativeEventObserverError(EVENTS.failures.missing);
        return observation;
      })();
      return stopResult;
    },
  };
}
