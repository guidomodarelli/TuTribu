/** Probes actual Orca/native audio on a disposable CI display before attempting product journeys. */
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, open, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, webkit } from "@playwright/test";
import { ADMISSION_READER_PROBE as PROBE } from "../../tests/support/constants/admission-reader-probe.mjs";
import { diagnoseNativeReaderSpeech, hasNativeReaderSpeech, hasNativeReaderTargetFocus, measureNativeAudioPeak } from "../../tests/support/admission-reader-observation.mjs";
import { configureAdmissionBrowserNativeFocus } from "../../tests/support/admission-browser-native-focus.mjs";
import { renderAdmissionReaderProbePage } from "../../tests/support/admission-reader-probe-page.mjs";

if (process.platform !== "linux" || process.env.GITHUB_ACTIONS !== "true" || !process.env.DISPLAY || !process.env.RUNNER_TEMP) throw new Error("AdmissionReaderProbe.start failed: disposable_linux_display_required");
const directory = join(process.env.RUNNER_TEMP, "admission-reader-probe");
await mkdir(directory, { recursive: true });
const debugPath = process.env.ORCA_DEBUG_LOG, audioPath = process.env.ORCA_AUDIO_FILE;
if (!debugPath || !audioPath) throw new Error("AdmissionReaderProbe.start failed: native_capture_paths_required");
const cases = PROBE.engines.flatMap((engine) => PROBE.widths.flatMap((width) => Object.values(PROBE.markupVariants).map((markupVariant) => {
  const id = randomUUID().replaceAll("-", "").slice(0, 8);
  return { id, engine, width, markupVariant, title: `${PROBE.titlePrefix} ${id}`, focus: `${PROBE.focusPrefix} ${id}`, status: `${PROBE.statusPrefix} ${id}` };
})));
const report = { commit: process.env.GITHUB_SHA, kind: "platform_preflight", productJourneysValidated: false, realMessages: 0, orcaVersion: process.env.ORCA_BINARY_VERSION ?? null, orcaSourceCommit: process.env.ORCA_SOURCE_COMMIT ?? null, speechDispatcherVersion: process.env.SPEECH_DISPATCHER_VERSION ?? null, cases: [] };
const server = createServer((request, response) => {
  const item = cases.find((candidate) => new URL(request.url, "http://127.0.0.1").pathname === `/${candidate.id}`);
  if (!item) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(renderAdmissionReaderProbePage(item));
});
await new Promise((fulfill) => server.listen(0, "127.0.0.1", fulfill));
const address = server.address();
if (!address || typeof address === "string") throw new Error("AdmissionReaderProbe.start failed: loopback_server_unavailable");
const origin = `http://127.0.0.1:${address.port}`;
/** @returns Native append-only reader output; startup absence remains an empty observation. */
async function readerLog() { return readFile(debugPath, "utf8").catch((error) => { if (error.code === "ENOENT") return ""; throw error; }); }
/** @returns Bytes currently written by the native PulseAudio monitor. */
async function audioSize() { return (await stat(audioPath).catch((error) => { if (error.code === "ENOENT") return null; throw error; }))?.size ?? 0; }
/** @param {number} start - First byte of this observation. @returns Actual signed PCM peak, bounded to this phase's latest samples. */
async function audioPeak(start) {
  const size = await audioSize();
  const offset = Math.max(start, size - PROBE.maximumAudioBytes);
  if (size <= offset) return 0;
  const handle = await open(audioPath, "r");
  try { const bytes = Buffer.alloc(size - offset); const { bytesRead } = await handle.read(bytes, 0, bytes.length, offset); return measureNativeAudioPeak(bytes.subarray(0, bytesRead)); }
  finally { await handle.close(); }
}
/** @param {() => Promise<boolean>} predicate - Actual observable state. @param {string} code - Closed failure code. @returns After observing it within the fixed capability deadline. */
async function until(predicate, code) {
  const deadline = Date.now() + PROBE.observationTimeoutMs;
  while (Date.now() < deadline) { if (await predicate()) return; await delay(PROBE.pollMs); }
  throw new Error(code);
}
/** @param {(()=>void)|undefined} [interruptIntroduction] - Real native cancellation only during initial preparation. @returns {Promise<void>} After the monitor produces a silent tail. */
async function quiet(interruptIntroduction = undefined) {
  let speechOffset = (await readerLog()).length;
  const bytes = Math.ceil(PROBE.sampleRate * PROBE.bytesPerSample * PROBE.silenceWindowMs / PROBE.millisecondsPerSecond);
  await until(async () => {
    if (interruptIntroduction) {
      const observed = await readerLog();
      if (observed.slice(speechOffset).includes(PROBE.speechMarker)) { speechOffset = observed.length; interruptIntroduction(); }
    }
    const size = await audioSize(); return size >= bytes && await audioPeak(size - bytes) <= PROBE.audiblePeak;
  }, PROBE.failures.silence);
}
/** @param {string} title - Unique title of this owned fixture. @returns Before native input is delivered exclusively to its active window. */
function assertActiveWindow(title) {
  const active = execFileSync("xdotool", ["getactivewindow", "getwindowname"], { encoding: "utf8", timeout: PROBE.windowCommandTimeoutMs });
  if (!active.includes(title)) throw new Error(PROBE.failures.window);
}
/** @param {string} title - Owned visible window. @param {string} key - Fixed native key. @returns After genuine X11 input, without browser event synthesis. */
function nativeKey(title, key) { assertActiveWindow(title); execFileSync("xdotool", ["key", "--clearmodifiers", key], { timeout: PROBE.windowCommandTimeoutMs }); }
/** @param {string} expected - Own synthetic control label. @returns {unknown} Native state flags without names or typed values. */
function nativeFocus(expected) {
  try { return JSON.parse(execFileSync("/usr/bin/python3", ["tests/support/admission-reader-atspi.py", expected, String(PROBE.maximumAccessibilityNodes), String(PROBE.maximumAccessibilityDepth), String(PROBE.accessibilityTimeoutMs), "focus"], { encoding: "utf8", timeout: PROBE.windowCommandTimeoutMs, stdio: ["ignore", "pipe", "pipe"] })); }
  catch (error) { return { unavailable: true, failureName: error instanceof Error ? error.name : "unknown" }; }
}
/** @param {string} expected - Own synthetic status, inspected only after voice/audio observation. @returns {unknown} Native text matches and SDK-call counters without content. */
function nativeStatus(expected) {
  try { return JSON.parse(execFileSync("/usr/bin/python3", ["tests/support/admission-reader-atspi.py", expected, String(PROBE.maximumAccessibilityNodes), String(PROBE.maximumAccessibilityDepth), String(PROBE.accessibilityTimeoutMs), "status", PROBE.headingText], { encoding: "utf8", timeout: PROBE.windowCommandTimeoutMs, stdio: ["ignore", "pipe", "pipe"] })); }
  catch (error) { return { unavailable: true, failureName: error instanceof Error ? error.name : "unknown" }; }
}
try {
  for (const item of cases) {
    const observation = { caseId: item.id, engine: item.engine, width: item.width, markupVariant: item.markupVariant, height: PROBE.height, passed: false };
    const caseLogOffset = (await readerLog()).length;
    let speechPhaseOffset = caseLogOffset, expectedSpeech = item.focus;
    observation.speechPhase = PROBE.speechPhases.setup;
    let browser;
    try {
      browser = await ({ chromium, webkit })[item.engine].launch({ headless: false, env: { ...process.env, LANG: PROBE.nativeBrowserLocale, LC_ALL: PROBE.nativeBrowserLocale }, ...(item.engine === "chromium" ? { args: PROBE.chromiumLaunchArguments } : {}) });
      observation.browserVersion = browser.version();
      const context = await browser.newContext({ viewport: { width: item.width, height: PROBE.height }, reducedMotion: "reduce", locale: PROBE.locale });
      const page = await context.newPage();
      await page.goto(`${origin}/${item.id}`, { waitUntil: "load" });
      observation.focusEmulationDisabled = await configureAdmissionBrowserNativeFocus(page);
      await page.bringToFront();
      await until(async () => { try { assertActiveWindow(item.title); return true; } catch { return false; } }, PROBE.failures.window);
      nativeKey(item.title, PROBE.nativeKeys.interrupt);
      observation.initialInterruptSent = true;
      observation.initialInterruptCount = 1;
      await quiet(() => { nativeKey(item.title, PROBE.nativeKeys.interrupt); observation.initialInterruptCount += 1; });
      let speechOffset = (await readerLog()).length, audioOffset = await audioSize();
      speechPhaseOffset = speechOffset;
      observation.speechPhase = PROBE.speechPhases.focus;
      const button = page.getByRole("button", { name: item.focus, exact: true });
      for (let tabIndex = 0; tabIndex < PROBE.maximumTabs; tabIndex += 1) {
        nativeKey(item.title, PROBE.nativeKeys.next);
        await delay(PROBE.pollMs);
        if (await button.evaluate((element) => element.ownerDocument.hasFocus() && element === element.ownerDocument.activeElement)) {
          observation.nativeControlFocus = nativeFocus(item.focus);
          if (hasNativeReaderTargetFocus(observation.nativeControlFocus)) break;
        }
      }
      if (!await button.evaluate((element) => element.ownerDocument.hasFocus() && element === element.ownerDocument.activeElement) || !hasNativeReaderTargetFocus(observation.nativeControlFocus)) throw new Error(PROBE.failures.focus);
      await until(async () => hasNativeReaderSpeech((await readerLog()).slice(speechOffset), item.focus), PROBE.failures.speech);
      await until(async () => await audioPeak(audioOffset) > PROBE.audiblePeak, PROBE.failures.audio);
      observation.focusSpeechObserved = true; observation.focusAudioPeak = await audioPeak(audioOffset);
      await quiet();
      observation.nativeFocusBeforeLive = nativeFocus(item.focus);
      if (!await button.evaluate((element) => element.ownerDocument.hasFocus() && element === element.ownerDocument.activeElement) || !hasNativeReaderTargetFocus(observation.nativeFocusBeforeLive)) throw new Error(PROBE.failures.focus);
      speechOffset = (await readerLog()).length; audioOffset = await audioSize();
      speechPhaseOffset = speechOffset; expectedSpeech = item.status;
      observation.speechPhase = PROBE.speechPhases.live;
      nativeKey(item.title, PROBE.nativeKeys.invoke);
      await until(async () => await page.locator("#status").textContent() === item.status, PROBE.failures.status);
      await until(async () => hasNativeReaderSpeech((await readerLog()).slice(speechOffset), item.status), PROBE.failures.speech);
      await until(async () => await audioPeak(audioOffset) > PROBE.audiblePeak, PROBE.failures.audio);
      observation.liveSpeechObserved = true; observation.liveAudioPeak = await audioPeak(audioOffset);
      observation.passed = true;
      observation.nativeAccessibility = nativeStatus(item.status);
      await page.screenshot({ path: join(directory, `${item.engine}-${item.width}-${item.markupVariant}.png`) });
    } catch (error) {
      observation.failureCode = error instanceof Error && Object.values(PROBE.failures).includes(error.message) ? error.message : PROBE.failures.runtime;
      observation.failureName = error instanceof Error ? error.name : "unknown";
      observation.failureHint = error instanceof Error ? error.message.split("\n")[0].slice(0, PROBE.maximumFailureHintCharacters) : "unknown";
      const recordedLog = await readerLog();
      if (item.engine === "webkit") await writeFile(join(directory, `${item.engine}-${item.width}-${item.markupVariant}-native.log`), recordedLog.slice(speechPhaseOffset).slice(-PROBE.maximumNativeDiagnosticCharacters));
      const observedLog = recordedLog.slice(caseLogOffset);
      observation.nativeSpeechTail = observedLog.split(/\r?\n/u).filter((line) => line.includes(PROBE.speechMarker)).slice(-PROBE.maximumDiagnosticLines).map((line) => line.replace(/<[^>]*>/gu, "").slice(0, PROBE.maximumDiagnosticCharacters));
      observation.scriptDiagnostics = [...new Set(observedLog.split(/\r?\n/u).filter((line) => /(?:SCRIPT|Script).*(?:WebKit|Chromium|chromium|webkit|MiniBrowser|default|gtk)/u.test(line)).map((line) => line.slice(0, PROBE.maximumDiagnosticCharacters)))].slice(-PROBE.maximumDiagnosticLines);
      observation.nativeEventTail = observedLog.split(/\r?\n/u).filter((line) => line.includes(item.status) || /(?:LiveRegion|live region|object:text-changed)/u.test(line)).slice(-PROBE.maximumDiagnosticLines).map((line) => line.slice(0, PROBE.maximumDiagnosticCharacters));
      observation.speechSettings = observedLog.split(/\r?\n/u).filter((line) => /^(?:ORCA|SD) rate/u.test(line)).slice(-PROBE.maximumDiagnosticLines).map((line) => line.slice(0, PROBE.maximumDiagnosticCharacters));
      observation.audioBytes = await audioSize();
      observation.latestAudioPeak = await audioPeak(Math.max(0, observation.audioBytes - Math.ceil(PROBE.sampleRate * PROBE.bytesPerSample * PROBE.silenceWindowMs / PROBE.millisecondsPerSecond)));
      observation.nativeAccessibility = nativeStatus(item.status);
      observation.focusSpokenSincePageLoad = hasNativeReaderSpeech(observedLog, item.focus);
      observation.statusSpokenSincePageLoad = hasNativeReaderSpeech(observedLog, item.status);
      observation.speechDiagnostics = diagnoseNativeReaderSpeech(recordedLog.slice(speechPhaseOffset), expectedSpeech);
      process.exitCode = 1;
    } finally { await browser?.close(); }
    observation.nativeTextInspectionValidated = (observation.nativeAccessibility?.textObservation?.controlTextMatches ?? 0) > 0;
    observation.automaticReadingDisabledObserved = (await readerLog()).slice(caseLogOffset).includes(PROBE.automaticReadingDisabledMarker);
    report.cases.push(observation);
    console.log(JSON.stringify({ phase: "reader_capability_observed", ...observation }));
  }
} finally {
  await new Promise((fulfill) => server.close(fulfill));
  report.nativeTextInspectionValidated = report.cases.length === cases.length && report.cases.every((item) => item.nativeTextInspectionValidated);
  report.passed = report.cases.length === cases.length && report.cases.every((item) => item.passed) && report.nativeTextInspectionValidated;
  if (!report.nativeTextInspectionValidated) process.exitCode = 1;
  // This service observes only the loopback synthetic fixture, never the product or private pilot.
  if (!report.passed && process.env.ORCA_SERVICE_LOG) {
    const serviceLog = await readFile(process.env.ORCA_SERVICE_LOG, "utf8").catch((error) => { if (error.code === "ENOENT") return ""; throw error; });
    report.nativeServiceTail = serviceLog.split(PROBE.outputPatterns.lineSeparator).slice(-PROBE.maximumServiceDiagnosticLines).map((line) => line.slice(0, PROBE.maximumDiagnosticCharacters));
  }
  await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
