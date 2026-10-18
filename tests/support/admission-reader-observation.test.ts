/** @vitest-environment node */
/** Distinguishes native speech backend observations from DOM/debug fallback and actual audio silence. */
import { describe, expect, it } from "vitest";
import { hasNativeReaderSpeech, measureNativeAudioPeak } from "./admission-reader-observation.mjs";

describe("native reader observation boundary", () => {
  it("should accept a canary sent to the actual Speech Dispatcher backend", () => {
    expect(hasNativeReaderSpeech("SPEECH DISPATCHER: Speaking '<speak>Control de lectura ab12</speak>'", "Control de lectura ab12")).toBe(true);
  });

  it("should reject DOM event text and speech output without a backend", () => {
    expect(hasNativeReaderSpeech("object:text-changed Control de lectura ab12", "Control de lectura ab12")).toBe(false);
    expect(hasNativeReaderSpeech("SPEECH OUTPUT: 'Control de lectura ab12'", "Control de lectura ab12")).toBe(false);
    expect(hasNativeReaderSpeech("SPEECH DISPATCHER: Speaking 'Control de lectura cd34'", "Control de lectura ab12")).toBe(false);
    expect(hasNativeReaderSpeech("SPEECH DISPATCHER: Speaking ''", "")).toBe(false);
  });

  it("should distinguish actual signed PCM output from silence", () => {
    expect(measureNativeAudioPeak(Buffer.alloc(8))).toBe(0);
    const audio = Buffer.alloc(6);
    audio.writeInt16LE(-1024, 0);
    audio.writeInt16LE(512, 2);
    audio.writeInt16LE(-32768, 4);
    expect(measureNativeAudioPeak(audio)).toBe(32768);
  });

  it("should ignore incomplete trailing PCM bytes", () => {
    expect(measureNativeAudioPeak(Buffer.from([0, 0, 255]))).toBe(0);
  });
});
