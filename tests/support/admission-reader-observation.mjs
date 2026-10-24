/** Reads actual reader/PCM observations while exposing only canary matches and numeric amplitude. */
import { ADMISSION_READER_PROBE } from "./constants/admission-reader-probe.mjs";

/** @param {string} output - Native --version stdout, kept private. @returns {string|null} The unambiguous Orca version, excluding dependency/session information. */
export function parseNativeReaderVersion(output) {
  /** @type {Set<string>} */
  const versions = new Set();
  for (const match of output.trim().matchAll(ADMISSION_READER_PROBE.outputPatterns.versionLine)) {
    const version = match.groups?.plainVersion ?? match.groups?.detailedVersion;
    if (version) versions.add(version);
  }
  return versions.size === 1 ? versions.values().next().value ?? null : null;
}

/** @param {string} log - Private native Orca debug output. @param {string} canary - Expected synthetic UI label. @returns {boolean} Whether the real speech backend received that label. */
export function hasNativeReaderSpeech(log, canary) {
  if (!canary.trim()) return false;
  return log.split(ADMISSION_READER_PROBE.outputPatterns.lineSeparator).some((line) => line.includes(ADMISSION_READER_PROBE.speechMarker) && line.replace(ADMISSION_READER_PROBE.outputPatterns.markup, "").includes(canary));
}

/** @typedef {{textInsertionEntries:number,handledEntries:number,rejectedEntries:number,inactiveDocumentEntries:number,focusedAlertEntries:number,presenterDisabledEntries:number,queuePresentationEntries:number,monitoringDisabledEntries:number,pageSwitchInsertionEntries:number}} NativeLiveRegionPipeline */

/**
 * Counts entries from Orca's pinned web event pipeline without retaining labels or accepting them as speech.
 * A queue marker precedes presentation and does not prove audible output; counts are log entries, not distinct events.
 * @param {string} log - Private native debug output from the bounded observation phase.
 * @returns {NativeLiveRegionPipeline} Only fixed numeric counters, with no event content or object identity.
 */
export function diagnoseNativeLiveRegionPipeline(log) {
  const lines = log.split(ADMISSION_READER_PROBE.outputPatterns.lineSeparator);
  const markers = ADMISSION_READER_PROBE.liveRegionMarkers;
  /** @param {string|ReadonlyArray<string>} marker - Closed historical/current provider markers. @returns {number} Matching log entries counted once per line. */
  const countEntries = (marker) => {
    const alternatives = typeof marker === "string" ? [marker] : marker;
    return lines.filter((line) => alternatives.some((alternative) => line.includes(alternative))).length;
  };
  return {
    textInsertionEntries: countEntries(markers.textInsertion),
    handledEntries: countEntries(markers.handled),
    rejectedEntries: countEntries(markers.rejected),
    inactiveDocumentEntries: countEntries(markers.inactiveDocument),
    focusedAlertEntries: countEntries(markers.focusedAlert),
    presenterDisabledEntries: countEntries(markers.presenterDisabled),
    queuePresentationEntries: countEntries(markers.queuePresentation),
    monitoringDisabledEntries: countEntries(markers.monitoringDisabled),
    pageSwitchInsertionEntries: countEntries(markers.pageSwitchInsertion),
  };
}

/**
 * Requires a current native target and rejects concurrent editable browser chrome focus.
 * @param {unknown} observation - Own inspector projection, never a DOM focus result.
 * @returns {boolean} Whether native focus permits activating the expected control.
 */
export function hasNativeReaderTargetFocus(observation) {
  if (!observation || typeof observation !== "object" || !("expectedNodes" in observation) || !("focusedNodes" in observation)) return false;
  if ("unavailable" in observation && observation.unavailable === true) return false;
  const { expectedNodes, focusedNodes } = observation;
  if (!Array.isArray(expectedNodes) || !Array.isArray(focusedNodes)) return false;
  /** @param {{focused?:boolean,visible?:boolean,showing?:boolean,enabled?:boolean}|null} node - Own native state flags. @returns {boolean} Current visible and enabled native focus. */
  const currentFocus = (node) => node?.focused === true && node.visible === true && node.showing === true && node.enabled === true;
  /** @param {{focused?:boolean,visible?:boolean,showing?:boolean,enabled?:boolean,editable?:boolean,nameMatchesExpected?:boolean}|null} node - Own projected native control. @returns {boolean} Fully reported target focus. */
  const expectedFocus = (node) => currentFocus(node) && node.nameMatchesExpected === true && typeof node.editable === "boolean";
  return expectedNodes.some(expectedFocus) && focusedNodes.some(expectedFocus)
    && !focusedNodes.some((node) => currentFocus(node) && (typeof node.editable !== "boolean" || (node.editable && node.nameMatchesExpected !== true)));
}

/**
 * Projects native output into counters and flags without retaining a transcript or changing acceptance.
 * @param {string} log - Private output captured after the native action began.
 * @param {string} expected - Controlled product label expected during this phase.
 * @returns {{backendLogEntries:number,fallbackOutputs:number,labelInDebug:boolean,exactMatch:boolean,normalizedMatch:boolean,expectedWords:number,observedWords:number,actionKeyEchoOutputs:number,liveRegionPipeline:NativeLiveRegionPipeline}} Safe diagnostic metadata only.
 */
export function diagnoseNativeReaderSpeech(log, expected) {
  const { outputPatterns, speechMarker, fallbackSpeechMarker } = ADMISSION_READER_PROBE;
  const lines = log.split(outputPatterns.lineSeparator);
  const utterances = lines.filter((line) => line.includes(speechMarker)).map((line) => line.slice(line.indexOf(speechMarker) + speechMarker.length).replace(outputPatterns.markup, "").replace(outputPatterns.speechEnvelope, ""));
  const normalized = utterances.join(" ").normalize("NFC").replace(outputPatterns.whitespace, " ").trim();
  const label = expected.normalize("NFC").replace(outputPatterns.whitespace, " ").trim();
  const words = label ? label.split(outputPatterns.wordSeparator) : [];
  const spokenWords = new Set(normalized.split(outputPatterns.wordSeparator));
  return {
    backendLogEntries: utterances.length,
    fallbackOutputs: lines.filter((line) => line.includes(fallbackSpeechMarker)).length,
    labelInDebug: Boolean(expected.trim()) && log.includes(expected),
    exactMatch: hasNativeReaderSpeech(log, expected),
    normalizedMatch: Boolean(label) && normalized.includes(label),
    expectedWords: words.length,
    observedWords: words.filter((word) => spokenWords.has(word)).length,
    actionKeyEchoOutputs: utterances.filter((utterance) => ADMISSION_READER_PROBE.actionKeyWords.includes(utterance.trim().toLowerCase())).length,
    liveRegionPipeline: diagnoseNativeLiveRegionPipeline(log),
  };
}

/** @param {Buffer} bytes - Native mono signed little-endian PCM16 samples. @returns {number} Absolute peak, ignoring an incomplete trailing sample. */
export function measureNativeAudioPeak(bytes) {
  let peak = 0;
  for (let index = 0; index + ADMISSION_READER_PROBE.bytesPerSample <= bytes.length; index += ADMISSION_READER_PROBE.bytesPerSample) peak = Math.max(peak, Math.abs(bytes.readInt16LE(index)));
  return peak;
}
