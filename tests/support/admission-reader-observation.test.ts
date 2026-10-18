/** @vitest-environment node */
/** Distinguishes native speech backend observations from DOM/debug fallback and actual audio silence. */
import { describe, expect, it } from "vitest";
import { diagnoseNativeReaderSpeech, hasNativeReaderSpeech, measureNativeAudioPeak, parseNativeReaderVersion } from "./admission-reader-observation.mjs";

describe("native reader observation boundary", () => {
  it("should read the bare version reported by older Orca releases", () => {
    expect(parseNativeReaderVersion("47.2\n")).toBe("47.2");
  });

  it("should read Orca's version independently from its session and AT-SPI details", () => {
    expect(parseNativeReaderVersion("Orca version 48.9 (rev 4b964097f), AT-SPI2 version: 2.50.6, Session: x11 GNOME\n")).toBe("48.9");
    expect(parseNativeReaderVersion("Orca version 48.9, AT-SPI2 version: 2.50.6\n")).toBe("48.9");
  });

  it("should reject absent or malformed reader versions instead of using a dependency version", () => {
    expect(parseNativeReaderVersion("AT-SPI2 version: 2.50.6\n")).toBeNull();
    expect(parseNativeReaderVersion("Orca version 48.9-invalid, AT-SPI2 version: 2.50.6\n")).toBeNull();
    expect(parseNativeReaderVersion("")).toBeNull();
  });

  it("should reject contradictory reader versions", () => {
    expect(parseNativeReaderVersion("47.2\nOrca version 48.9, AT-SPI2 version: 2.50.6\n")).toBeNull();
  });

  it("should accept a canary sent to the actual Speech Dispatcher backend", () => {
    const log = "SPEECH DISPATCHER: Speaking '<speak>Control de lectura ab12</speak>'";
    expect(hasNativeReaderSpeech(log, "Control de lectura ab12")).toBe(true);
    expect(diagnoseNativeReaderSpeech(log, "Control de lectura ab12")).toEqual({
      backendLogEntries: 1, fallbackOutputs: 0, labelInDebug: true, exactMatch: true,
      normalizedMatch: true, expectedWords: 4, observedWords: 4,
    });
  });

  it("should reject DOM event text and speech output without a backend", () => {
    expect(hasNativeReaderSpeech("object:text-changed Control de lectura ab12", "Control de lectura ab12")).toBe(false);
    expect(hasNativeReaderSpeech("SPEECH OUTPUT: 'Control de lectura ab12'", "Control de lectura ab12")).toBe(false);
    expect(hasNativeReaderSpeech("SPEECH DISPATCHER: Speaking 'Control de lectura cd34'", "Control de lectura ab12")).toBe(false);
    expect(hasNativeReaderSpeech("SPEECH DISPATCHER: Speaking ''", "")).toBe(false);
  });

  it("should distinguish a label in debug events from words actually sent to the backend", () => {
    const log = "object:text-changed Confirmo cancelar solicitud\nSPEECH OUTPUT: 'Confirmo cancelar solicitud'\nSPEECH DISPATCHER: Speaking '<speak>Otro elemento</speak>'";
    expect(diagnoseNativeReaderSpeech(log, "Confirmo cancelar solicitud")).toEqual({
      backendLogEntries: 1, fallbackOutputs: 1, labelInDebug: true, exactMatch: false,
      normalizedMatch: false, expectedWords: 3, observedWords: 0,
    });
  });

  it("should diagnose fragmented backend speech without accepting it as an exact announcement", () => {
    const log = "SPEECH DISPATCHER: Speaking '<speak>Confirmo que quiero</speak>'\nSPEECH DISPATCHER: Speaking '<speak>cancelar esta solicitud</speak>'";
    expect(diagnoseNativeReaderSpeech(log, "Confirmo que quiero cancelar esta solicitud")).toEqual({
      backendLogEntries: 2, fallbackOutputs: 0, labelInDebug: false, exactMatch: false,
      normalizedMatch: true, expectedWords: 6, observedWords: 6,
    });
    expect(hasNativeReaderSpeech(log, "Confirmo que quiero cancelar esta solicitud")).toBe(false);
  });

  it("should expose only counters and flags when native output contains unrelated private values", () => {
    const log = "SPEECH DISPATCHER: Speaking '<speak>private-contact@synthetic.test</speak>'";
    expect(diagnoseNativeReaderSpeech(log, "Guardar conexión")).toEqual({
      backendLogEntries: 1, fallbackOutputs: 0, labelInDebug: false, exactMatch: false,
      normalizedMatch: false, expectedWords: 2, observedWords: 0,
    });
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
