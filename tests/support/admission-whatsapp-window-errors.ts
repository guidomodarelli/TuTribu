/** Observes actual global errors across documents and retains narrow WebKit console diagnostics separately. @module admission-whatsapp-window-errors */
import type { Page } from "@playwright/test";
import { z } from "zod";
import type { AdmissionWhatsappBrowserErrorObservation } from "./admission-whatsapp-browser-errors";
import { ADMISSION_WHATSAPP_BROWSER_PHASE } from "./constants/admission-whatsapp-number";
import { ADMISSION_WHATSAPP_WINDOW_FAILURE as FAILURE, ADMISSION_WHATSAPP_WINDOW_OBSERVER as OBSERVER } from "./constants/admission-whatsapp-window-errors";

/** Closed browser events contain timing/realm identity only; no Error, URL or Promise is read. */
export type AdmissionWhatsappWindowRecord = {
  kind: "realm_init" | "pageshow" | "pagehide" | "window_error" | "resource_error" | "unhandled_rejection";
  at: number;
  realm: string;
  top: boolean;
};
/** Availability and truncation are part of the oracle rather than interpreted as zero errors. */
export type AdmissionWhatsappWindowSnapshot = { available: false } | { available: true; count: number; records: AdmissionWhatsappWindowRecord[] };
/** Associates safe metadata with the native callback time; it does not identify the caller's Promise. */
export type AdmissionWhatsappTimedBrowserError = { at: number; observation: AdmissionWhatsappBrowserErrorObservation };
/** Keeps diagnostics counted while exposing only the conditions that block the real flow test. */
export type AdmissionWhatsappBrowserErrorVerdict = { blocking: string[]; nativeRetirementDiagnostics: number; windowExceptions: number; unhandledRejections: number };

/** Validates the own instrumentation envelope after crossing from the renderer. */
const snapshotSchema = z.object({
  count: z.number().int().nonnegative(),
  records: z.array(z.object({ kind: z.enum(["realm_init", "pageshow", "pagehide", "window_error", "resource_error", "unhandled_rejection"]), at: z.number().int().nonnegative(), realm: z.string().regex(/^\d+-\d+$/), top: z.boolean() }).strict()).max(OBSERVER.maximumRecords),
}).strict();

/** Page-owned mutable state survives renderer replacement and cannot be reset by a later realm. */
const observerStates = new WeakMap<Page, { failed: boolean }>();

/**
 * Installs synchronous observation before application code without changing fetch or Promise handling.
 * @param page - Owned page; the script also observes its frames and future documents.
 * @returns Once the native init script has been registered.
 */
export async function installAdmissionWhatsappWindowObserver(page: Page): Promise<void> {
  if (observerStates.has(page)) return;
  const observerState = { failed: false };
  observerStates.set(page, observerState);
  page.on("console", (message) => { if (message.type() === "debug" && message.text() === OBSERVER.failureMarker) observerState.failed = true; });
  try { await page.addInitScript(({ storageKey, maximumRecords, failureMarker }) => {
    const realm = Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-");
    const state = globalThis as unknown as Record<string, unknown>;
    const reportFailure = console.debug.bind(console);
    state[storageKey] = true;
    const record = (kind: "realm_init" | "pageshow" | "pagehide" | "window_error" | "resource_error" | "unhandled_rejection") => {
      try {
        const previous = JSON.parse(localStorage.getItem(storageKey) || '{"count":0,"records":[]}');
        previous.count += 1;
        previous.records.push({ kind, at: Date.now(), realm, top: window === window.top });
        previous.records = previous.records.slice(-maximumRecords);
        localStorage.setItem(storageKey, JSON.stringify(previous));
      } catch { state[storageKey] = false; reportFailure(failureMarker); }
    };
    record("realm_init");
    window.addEventListener("error", (event) => record(event instanceof ErrorEvent && event.target === window ? "window_error" : "resource_error"), true);
    window.addEventListener("unhandledrejection", () => record("unhandled_rejection"), true);
    window.addEventListener("pagehide", () => record("pagehide"), true);
    window.addEventListener("pageshow", () => record("pageshow"), true);
  }, { storageKey: OBSERVER.storageKey, maximumRecords: OBSERVER.maximumRecords, failureMarker: OBSERVER.failureMarker }); }
  catch (error) { observerState.failed = true; throw error; }
}

/**
 * Reads closed cross-document metadata within a bounded budget; failed observation cannot approve a run.
 * @param page - Owned live page; context cleanup cancels any outstanding evaluation.
 * @returns Validated instrumentation or explicit unavailability.
 */
export async function readAdmissionWhatsappWindowSnapshot(page: Page): Promise<AdmissionWhatsappWindowSnapshot> {
  const observerState = observerStates.get(page);
  if (!observerState || observerState.failed) return { available: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = page.evaluate((storageKey) => {
    if ((globalThis as unknown as Record<string, unknown>)[storageKey] !== true) return null;
    return JSON.parse(localStorage.getItem(storageKey) || "null") as unknown;
  }, OBSERVER.storageKey).then((value: unknown) => value, () => null);
  const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), OBSERVER.readTimeoutMs); });
  try {
    const parsed = snapshotSchema.safeParse(await Promise.race([pending, deadline]));
    return !observerState.failed && parsed.success && parsed.data.records.some((record) => record.kind === "realm_init" && record.top) ? { available: true, ...parsed.data } : { available: false };
  } finally { if (timer) clearTimeout(timer); }
}

/**
 * Separates the calibrated WebKit transport console diagnostic from observable JavaScript failures.
 * @param engineName - Actual installed engine used by this flow.
 * @param errors - Every retained safe native Pageerror, including its callback time.
 * @param totalErrors - Original native count; truncation fails the oracle.
 * @param windows - Both surfaces' validated cross-document observations.
 * @returns Failures plus a count of retained retirement diagnostics. No conclusion about a retired Promise's handling is made.
 */
export function classifyAdmissionWhatsappBrowserErrors(engineName: string, errors: AdmissionWhatsappTimedBrowserError[], totalErrors: number, windows: { leaderSurface: boolean; snapshot: AdmissionWhatsappWindowSnapshot }[]): AdmissionWhatsappBrowserErrorVerdict {
  const blocking: string[] = [];
  let windowExceptions = 0, unhandledRejections = 0, nativeRetirementDiagnostics = 0;
  if (totalErrors !== errors.length) blocking.push(FAILURE.truncated);
  for (const { snapshot } of windows) {
    if (!snapshot.available) { blocking.push(FAILURE.unavailable); continue; }
    if (snapshot.count !== snapshot.records.length) blocking.push(FAILURE.truncated);
    windowExceptions += snapshot.records.filter((record) => record.kind === "window_error").length;
    unhandledRejections += snapshot.records.filter((record) => record.kind === "unhandled_rejection").length;
  }
  if (windowExceptions) blocking.push(FAILURE.exception);
  if (unhandledRejections) blocking.push(FAILURE.rejection);
  for (const error of errors) {
    const { observation } = error;
    const snapshot = windows.find((window) => window.leaderSurface === observation.leaderSurface)?.snapshot;
    const nearbyRetirement = snapshot?.available && snapshot.count === snapshot.records.length && snapshot.records.some((record) => record.kind === "pagehide" && record.top && Math.abs(record.at - error.at) <= OBSERVER.retirementProximityMs && snapshot.records.some((next) => next.kind === "realm_init" && next.top && next.realm !== record.realm && next.at >= record.at && next.at - record.at <= OBSERVER.retirementProximityMs));
    if (engineName === "webkit" && observation.phase === ADMISSION_WHATSAPP_BROWSER_PHASE.personalNavigation && !observation.leaderSurface && observation.nativeSessionAccessControlDiagnostic && observation.matchesAccountProbe && !observation.matchesSubmission && !observation.matchesCorrection && nearbyRetirement) nativeRetirementDiagnostics += 1;
    else blocking.push(FAILURE.pageError);
  }
  return { blocking, nativeRetirementDiagnostics, windowExceptions, unhandledRejections };
}
