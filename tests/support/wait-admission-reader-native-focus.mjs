/** Observes own DOM/native projections without moving focus or generating speech. */
import { hasNativeReaderTargetFocus } from "./admission-reader-observation.mjs";
import { ADMISSION_READER_PROBE } from "./constants/admission-reader-probe.mjs";

/**
 * Keeps the existing native predicate and requires current DOM focus after its observation.
 * @param {{readDomFocus:()=>Promise<boolean>,inspectFocus:()=>unknown|Promise<unknown>,nowMs:()=>number,pause:()=>Promise<void>}} dependencies - Own bounded observation and clock ports.
 * @returns {Promise<{focused:boolean,observation:unknown,samples:number,elapsedMs:number,domFocusRetained:boolean}>} Safe state only, with no control values or text.
 */
export async function waitForAdmissionNativeTargetFocus({ readDomFocus, inspectFocus, nowMs, pause }) {
  const started = nowMs(), deadline = started + ADMISSION_READER_PROBE.focusSettleTimeoutMs;
  let observation = null, samples = 0, domFocusRetained = await readDomFocus();
  while (domFocusRetained && (samples === 0 || nowMs() < deadline)) {
    observation = await inspectFocus(); samples += 1;
    domFocusRetained = await readDomFocus();
    if (domFocusRetained && hasNativeReaderTargetFocus(observation)) return { focused: true, observation, samples, elapsedMs: nowMs() - started, domFocusRetained };
    if (!domFocusRetained || nowMs() >= deadline) break;
    await pause();
    domFocusRetained = await readDomFocus();
  }
  return { focused: false, observation, samples, elapsedMs: nowMs() - started, domFocusRetained };
}
