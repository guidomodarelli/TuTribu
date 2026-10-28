/** Projects CPU sampling into owned numerical diagnostics without debugger state or arguments. */
import type { Profiler } from "node:inspector";
import type { Session as InspectorSession } from "node:inspector/promises";
import { z } from "zod";
import { ADMISSION_PERFORMANCE } from "./constants/admission-performance";
import { ADMISSION_CPU_PROFILE, ADMISSION_CPU_SOURCES, type AdmissionCpuSource } from "./constants/admission-cpu-profile";

export type AdmissionCpuEntry = { name: string; source: AdmissionCpuSource; lineNumber: number; columnNumber: number; selfMs: number; inclusiveMs: number; samples: number };
export type AdmissionCpuReport = { status: "available"; scope: string; durationMs: number; sampledMs: number; sampleCount: number; idleMs: number; garbageCollectionMs: number; unattributedMs: number; topSelf: AdmissionCpuEntry[]; topInclusive: AdmissionCpuEntry[] };
export type AdmissionCpuObservation = AdmissionCpuReport | { status: "unavailable"; reason: string };
const nonnegative = z.number().nonnegative();
const entrySchema = z.object({ name: z.string().max(ADMISSION_CPU_PROFILE.maximumSymbolLength), source: z.enum(ADMISSION_CPU_SOURCES), lineNumber: z.int().min(-1), columnNumber: z.int().min(-1), selfMs: nonnegative, inclusiveMs: nonnegative, samples: z.int().nonnegative() }).strict();
export const admissionCpuObservationSchema: z.ZodType<AdmissionCpuObservation> = z.union([
  z.object({ status: z.literal("available"), scope: z.literal(ADMISSION_CPU_PROFILE.scope), durationMs: nonnegative, sampledMs: nonnegative, sampleCount: z.int().nonnegative(), idleMs: nonnegative, garbageCollectionMs: nonnegative, unattributedMs: nonnegative, topSelf: z.array(entrySchema).max(ADMISSION_CPU_PROFILE.maximumEntries), topInclusive: z.array(entrySchema).max(ADMISSION_CPU_PROFILE.maximumEntries) }).strict(),
  z.object({ status: z.literal("unavailable"), reason: z.enum([ADMISSION_CPU_PROFILE.startUnavailable, ADMISSION_CPU_PROFILE.stopUnavailable]) }).strict(),
]);

/** @param name - Private frame symbol. @returns A bounded code symbol or a fixed anonymous label. */
function safeName(name: string): string {
  if ([ADMISSION_CPU_PROFILE.root, ADMISSION_CPU_PROFILE.idle, ADMISSION_CPU_PROFILE.garbageCollector, ADMISSION_CPU_PROFILE.program].some((known) => known === name)) return name;
  return name.length <= ADMISSION_CPU_PROFILE.maximumSymbolLength && ADMISSION_CPU_PROFILE.symbolPattern.test(name) ? name : ADMISSION_CPU_PROFILE.anonymous;
}

/** @param url - Private frame URL, read only to classify its origin. @returns The owned source bucket for the frame. */
function classifyCpuSource(url: string): AdmissionCpuSource {
  if (url.startsWith("node:")) return "node_runtime";
  return url.endsWith("/index.mjs") || url === "index.mjs" ? "application_bundle" : "other";
}

/**
 * Accounts for leaf samples and their ancestors without exposing URLs, script identifiers or debugger state.
 * @param profile - Original V8 CPU-only provider profile, retained in memory until projection completes.
 * @returns Owned numerical diagnostics; inclusive times overlap and must not be summed across frames.
 */
export function projectAdmissionCpuProfile(profile: Profiler.Profile): AdmissionCpuReport {
  try {
    const samples = profile.samples ?? [], deltas = profile.timeDeltas ?? [];
    if (samples.length !== deltas.length || profile.endTime < profile.startTime) throw new Error(ADMISSION_CPU_PROFILE.invalidMessage);
    const entries = new Map<number, AdmissionCpuEntry>(), parents = new Map<number, number>();
    for (const node of profile.nodes) {
      if (entries.has(node.id)) throw new Error(ADMISSION_CPU_PROFILE.invalidMessage);
      const frame = node.callFrame;
      const source = classifyCpuSource(frame.url);
      entries.set(node.id, { name: safeName(frame.functionName), source, lineNumber: frame.lineNumber, columnNumber: frame.columnNumber, selfMs: 0, inclusiveMs: 0, samples: 0 });
      for (const child of node.children ?? []) { if (parents.has(child)) throw new Error(ADMISSION_CPU_PROFILE.invalidMessage); parents.set(child, node.id); }
    }
    for (const node of profile.nodes) {
      const seen = new Set<number>(); let current: number | undefined = node.id;
      while (current !== undefined) { if (seen.has(current)) throw new Error(ADMISSION_CPU_PROFILE.invalidMessage); seen.add(current); current = parents.get(current); }
    }
    let sampledMs = 0, unattributedMs = 0;
    for (let index = 0; index < samples.length; index += 1) {
      if (!Number.isFinite(deltas[index]) || deltas[index] < 0) throw new Error(ADMISSION_CPU_PROFILE.invalidMessage);
      const duration = deltas[index] / ADMISSION_PERFORMANCE.microsecondsPerMillisecond;
      sampledMs += duration;
      const leaf = entries.get(samples[index]);
      if (!leaf) { unattributedMs += duration; continue; }
      leaf.selfMs += duration; leaf.samples += 1;
      let current: number | undefined = samples[index];
      while (current !== undefined) { const entry = entries.get(current); if (entry) entry.inclusiveMs += duration; current = parents.get(current); }
    }
    const all = [...entries.values()], visible = all.filter((entry) => entry.name !== ADMISSION_CPU_PROFILE.root);
    const result: AdmissionCpuReport = { status: "available", scope: ADMISSION_CPU_PROFILE.scope, durationMs: (profile.endTime - profile.startTime) / ADMISSION_PERFORMANCE.microsecondsPerMillisecond, sampledMs, sampleCount: samples.length, idleMs: all.filter((entry) => entry.name === ADMISSION_CPU_PROFILE.idle).reduce((total, entry) => total + entry.selfMs, 0), garbageCollectionMs: all.filter((entry) => entry.name === ADMISSION_CPU_PROFILE.garbageCollector).reduce((total, entry) => total + entry.selfMs, 0), unattributedMs, topSelf: visible.filter((entry) => entry.selfMs > 0).sort((left, right) => right.selfMs - left.selfMs).slice(0, ADMISSION_CPU_PROFILE.maximumEntries), topInclusive: visible.filter((entry) => entry.inclusiveMs > 0).sort((left, right) => right.inclusiveMs - left.inclusiveMs).slice(0, ADMISSION_CPU_PROFILE.maximumEntries) };
    admissionCpuObservationSchema.parse(result);
    return result;
  } catch {
    // Never propagate the provider profile or a parsing error that may retain raw frame URLs.
    throw new Error(ADMISSION_CPU_PROFILE.invalidMessage);
  }
}

/**
 * Starts the native profiler after host authentication, without opening a debugger port.
 * @returns A bounded stopper that always disconnects, or an explicit unavailable observation.
 */
export async function startAdmissionCpuProfile(): Promise<{ stop: () => Promise<AdmissionCpuObservation> }> {
  let session: InspectorSession | undefined;
  try {
    const inspector = await import("node:inspector/promises");
    session = new inspector.Session(); session.connect();
    await session.post("Profiler.enable");
    await session.post("Profiler.setSamplingInterval", { interval: ADMISSION_CPU_PROFILE.samplingIntervalMicroseconds });
    await session.post("Profiler.start");
    const active = session;
    return { async stop() {
      try { const { profile } = await active.post("Profiler.stop"); return projectAdmissionCpuProfile(profile); }
      catch { return { status: "unavailable", reason: ADMISSION_CPU_PROFILE.stopUnavailable }; }
      finally { active.disconnect(); }
    } };
  } catch {
    session?.disconnect();
    return { stop: async () => ({ status: "unavailable", reason: ADMISSION_CPU_PROFILE.startUnavailable }) };
  }
}
