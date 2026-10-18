/** Reads actual reader/PCM observations while exposing only canary matches and numeric amplitude. */
import { ADMISSION_READER_PROBE } from "./constants/admission-reader-probe.mjs";

/** @param {string} log - Private native Orca debug output. @param {string} canary - Expected synthetic UI label. @returns {boolean} Whether the real speech backend received that label. */
export function hasNativeReaderSpeech(log, canary) {
  if (!canary.trim()) return false;
  return log.split(/\r?\n/u).some((line) => line.includes(ADMISSION_READER_PROBE.speechMarker) && line.replace(/<[^>]*>/gu, "").includes(canary));
}

/** @param {Buffer} bytes - Native mono signed little-endian PCM16 samples. @returns {number} Absolute peak, ignoring an incomplete trailing sample. */
export function measureNativeAudioPeak(bytes) {
  let peak = 0;
  for (let index = 0; index + ADMISSION_READER_PROBE.bytesPerSample <= bytes.length; index += ADMISSION_READER_PROBE.bytesPerSample) peak = Math.max(peak, Math.abs(bytes.readInt16LE(index)));
  return peak;
}
