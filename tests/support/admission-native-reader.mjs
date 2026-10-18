/** Drives only an owned Linux CI window and observes the real reader/audio without synthesizing announcements. */
import { execFileSync } from "node:child_process";
import { readFile, stat, open } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { ADMISSION_READER_PROBE as SETTINGS } from "./constants/admission-reader-probe.mjs";
import { diagnoseNativeReaderSpeech, hasNativeReaderSpeech, measureNativeAudioPeak } from "./admission-reader-observation.mjs";

/** @param {{onFailure?:(diagnostic:ReturnType<typeof diagnoseNativeReaderSpeech> & {audioPeak:number,nativeAccessibility:unknown})=>Promise<void>}} [options] - Optional safe failure projection owned by the test. @returns A reader bound to this disposable runner's native capture paths. */
export function createAdmissionNativeReader({ onFailure } = {}) {
  if (process.platform !== "linux" || process.env.GITHUB_ACTIONS !== "true" || !process.env.DISPLAY) throw new Error("AdmissionNativeReader.start failed: disposable_linux_display_required");
  const debugPath = process.env.ORCA_DEBUG_LOG, audioPath = process.env.ORCA_AUDIO_FILE;
  if (!debugPath || !audioPath) throw new Error("AdmissionNativeReader.start failed: capture_paths_required");
  const log = () => readFile(debugPath, "utf8").catch((error) => { if (error.code === "ENOENT") return ""; throw error; });
  const size = async () => (await stat(audioPath).catch((error) => { if (error.code === "ENOENT") return null; throw error; }))?.size ?? 0;
  /** @param {number} offset - Beginning of this phase. @returns {Promise<number>} Actual PCM peak in the bounded phase interval. */
  async function peak(offset) {
    const end = await size(), start = Math.max(offset, end - SETTINGS.maximumAudioBytes);
    if (end <= start) return 0;
    const handle = await open(audioPath, "r");
    try { const bytes = Buffer.alloc(end - start); const result = await handle.read(bytes, 0, bytes.length, start); return measureNativeAudioPeak(bytes.subarray(0, result.bytesRead)); }
    finally { await handle.close(); }
  }
  /** @param {() => Promise<boolean>} predicate - Real observed state. @param {string} code - Safe failure code. @returns {Promise<void>} After it is observed within the fixed deadline. */
  async function until(predicate, code) {
    const deadline = Date.now() + SETTINGS.observationTimeoutMs;
    while (Date.now() < deadline) { if (await predicate()) return; await delay(SETTINGS.pollMs); }
    throw new Error(code);
  }
  /** @returns {Promise<void>} After the actual output monitor has a complete silent tail. */
  async function quiet() {
    const length = Math.ceil(SETTINGS.sampleRate * SETTINGS.bytesPerSample * SETTINGS.silenceWindowMs / SETTINGS.millisecondsPerSecond);
    await until(async () => { const end = await size(); return end >= length && await peak(end - length) <= SETTINGS.audiblePeak; }, SETTINGS.failures.silence);
  }
  /** @param {string} title - Actual current application page title. @returns {void} Before native input is delivered to its owned CI window. */
  function assertWindow(title) {
    const active = execFileSync("xdotool", ["getactivewindow", "getwindowname"], { encoding: "utf8", timeout: SETTINGS.windowCommandTimeoutMs });
    if (!title || !active.includes(title)) throw new Error(SETTINGS.failures.window);
  }
  /** @param {import('@playwright/test').Page} page - Owned genuine product page. @param {string} key - Fixed native key. @returns {Promise<void>} After actual X11 input. */
  async function key(page, key) {
    assertWindow(await page.title());
    execFileSync("xdotool", ["key", "--clearmodifiers", key], { timeout: SETTINGS.windowCommandTimeoutMs });
  }
  /** @param {string} expected - Own controlled label, never emitted by the inspector. @returns {unknown} Native roles/state flags only, or an explicit unavailable observation. */
  function inspectNativeFocus(expected) {
    try {
      return JSON.parse(execFileSync("/usr/bin/python3", ["tests/support/admission-reader-atspi.py", expected, String(SETTINGS.maximumAccessibilityNodes), String(SETTINGS.maximumAccessibilityDepth), String(SETTINGS.accessibilityTimeoutMs), "focus"], { encoding: "utf8", timeout: SETTINGS.windowCommandTimeoutMs, stdio: ["ignore", "pipe", "pipe"] }));
    } catch { return { unavailable: true }; }
  }
  /** @param {import('@playwright/test').Page} page - Owned application document. @returns {Promise<void>} Before activation/typing is delivered to page content. */
  async function assertDocumentFocus(page) {
    if (!await page.evaluate(() => document.hasFocus())) throw new Error(SETTINGS.failures.focus);
  }
  /** @param {string} expected - Own safe UI message. @param {{logOffset:number,audioOffset:number}} mark - Capture before the action. @returns {Promise<{speechObserved:boolean,audioPeak:number}>} Verified native speech and audio. */
  async function hear(expected, mark) {
    try {
      await until(async () => hasNativeReaderSpeech((await log()).slice(mark.logOffset), expected), SETTINGS.failures.speech);
      await until(async () => await peak(mark.audioOffset) > SETTINGS.audiblePeak, SETTINGS.failures.audio);
      return { speechObserved: true, audioPeak: await peak(mark.audioOffset) };
    } catch (error) {
      if (onFailure) await onFailure({ ...diagnoseNativeReaderSpeech((await log()).slice(mark.logOffset), expected), audioPeak: await peak(mark.audioOffset), nativeAccessibility: inspectNativeFocus(expected) });
      throw error;
    }
  }
  /** @returns {Promise<{logOffset:number,audioOffset:number}>} New private capture offsets, with no transcript content. */
  async function mark() { return { logOffset: (await log()).length, audioOffset: await size() }; }
  return {
    /** @param {import('@playwright/test').Page} page - Genuine current product page. @returns {Promise<void>} Ready native input with the introductory utterance interrupted normally. */
    async ready(page) {
      await page.bringToFront();
      await until(async () => { try { assertWindow(await page.title()); return true; } catch { return false; } }, SETTINGS.failures.window);
      await key(page, SETTINGS.nativeKeys.interrupt);
      await quiet();
    },
    /** @param {import('@playwright/test').Page} page - Owned product page. @param {import('@playwright/test').Locator} target - Real control. @param {string} label - Safe expected announcement. @returns {Promise<{speechObserved:boolean,audioPeak:number}>} Native focus and spoken name. */
    async focus(page, target, label) {
      await quiet();
      const start = await mark();
      for (let index = 0; index < SETTINGS.maximumProductTabs; index += 1) {
        await key(page, SETTINGS.nativeKeys.next);
        await delay(SETTINGS.pollMs);
        if (await target.evaluate((element) => element.ownerDocument.hasFocus() && element === element.ownerDocument.activeElement)) return hear(label, start);
      }
      throw new Error(SETTINGS.failures.focus);
    },
    /** @param {import('@playwright/test').Page} page - Owned product page. @returns {Promise<void>} After a real Space press. */
    async activate(page) { await assertDocumentFocus(page); await key(page, SETTINGS.nativeKeys.invoke); },
    /** @param {import('@playwright/test').Page} page - Owned product page. @param {string} value - Synthetic operator input, never logged. @returns {Promise<void>} After real typing. */
    async type(page, value) {
      await assertDocumentFocus(page);
      assertWindow(await page.title());
      execFileSync("xdotool", ["type", "--clearmodifiers", "--delay", "1", value], { timeout: SETTINGS.windowCommandTimeoutMs });
      await key(page, SETTINGS.nativeKeys.interrupt);
    },
    /** @param {import('@playwright/test').Page} page - Owned page with its actual initiating control focused. @param {string} expected - Actual safe product feedback. @returns {Promise<{speechObserved:boolean,audioPeak:number}>} Its original native announcement, without forced reading or focus changes. */
    async activateAndHear(page, expected) {
      await quiet();
      await assertDocumentFocus(page);
      const start = await mark();
      await key(page, SETTINGS.nativeKeys.invoke);
      return hear(expected, start);
    },
  };
}
