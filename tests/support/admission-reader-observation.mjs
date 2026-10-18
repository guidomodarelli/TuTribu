/** Reads actual reader/PCM observations while exposing only canary matches and numeric amplitude. */
import { ADMISSION_READER_PROBE } from "./constants/admission-reader-probe.mjs";

/** @param {string} log - Private native Orca debug output. @param {string} canary - Expected synthetic UI label. @returns {boolean} Whether the real speech backend received that label. */
export function hasNativeReaderSpeech(log, canary) {
  if (!canary.trim()) return false;
  return log.split(ADMISSION_READER_PROBE.outputPatterns.lineSeparator).some((line) => line.includes(ADMISSION_READER_PROBE.speechMarker) && line.replace(ADMISSION_READER_PROBE.outputPatterns.markup, "").includes(canary));
}

/**
 * Projects native output into counters and flags without retaining a transcript or changing acceptance.
 * @param {string} log - Private output captured after the native action began.
 * @param {string} expected - Controlled product label expected during this phase.
 * @returns {{backendLogEntries:number,fallbackOutputs:number,labelInDebug:boolean,exactMatch:boolean,normalizedMatch:boolean,expectedWords:number,observedWords:number}} Safe diagnostic metadata only.
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
  };
}

/** @param {Buffer} bytes - Native mono signed little-endian PCM16 samples. @returns {number} Absolute peak, ignoring an incomplete trailing sample. */
export function measureNativeAudioPeak(bytes) {
  let peak = 0;
  for (let index = 0; index + ADMISSION_READER_PROBE.bytesPerSample <= bytes.length; index += ADMISSION_READER_PROBE.bytesPerSample) peak = Math.max(peak, Math.abs(bytes.readInt16LE(index)));
  return peak;
}
