/** @vitest-environment node */
/** Distinguishes native speech backend observations from DOM/debug fallback and actual audio silence. */
import { describe, expect, it } from "vitest";
import { diagnoseNativeLiveRegionPipeline, diagnoseNativeReaderSpeech, hasNativeReaderSpeech, hasNativeReaderTargetFocus, measureNativeAudioPeak, parseNativeReaderVersion } from "./admission-reader-observation.mjs";

const emptyLiveRegionPipeline = {
  textInsertionEntries: 0, handledEntries: 0, rejectedEntries: 0, inactiveDocumentEntries: 0,
  focusedAlertEntries: 0, presenterDisabledEntries: 0, queuePresentationEntries: 0, monitoringDisabledEntries: 0, pageSwitchInsertionEntries: 0,
};

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
      normalizedMatch: true, expectedWords: 4, observedWords: 4, actionKeyEchoOutputs: 0,
      liveRegionPipeline: emptyLiveRegionPipeline,
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
      normalizedMatch: false, expectedWords: 3, observedWords: 0, actionKeyEchoOutputs: 0,
      liveRegionPipeline: emptyLiveRegionPipeline,
    });
  });

  it("should diagnose fragmented backend speech without accepting it as an exact announcement", () => {
    const log = "SPEECH DISPATCHER: Speaking '<speak>Confirmo que quiero</speak>'\nSPEECH DISPATCHER: Speaking '<speak>cancelar esta solicitud</speak>'";
    expect(diagnoseNativeReaderSpeech(log, "Confirmo que quiero cancelar esta solicitud")).toEqual({
      backendLogEntries: 2, fallbackOutputs: 0, labelInDebug: false, exactMatch: false,
      normalizedMatch: true, expectedWords: 6, observedWords: 6, actionKeyEchoOutputs: 0,
      liveRegionPipeline: emptyLiveRegionPipeline,
    });
    expect(hasNativeReaderSpeech(log, "Confirmo que quiero cancelar esta solicitud")).toBe(false);
  });

  it("should expose only counters and flags when native output contains unrelated private values", () => {
    const log = "SPEECH DISPATCHER: Speaking '<speak>private-contact@synthetic.test</speak>'";
    expect(diagnoseNativeReaderSpeech(log, "Guardar conexión")).toEqual({
      backendLogEntries: 1, fallbackOutputs: 0, labelInDebug: false, exactMatch: false,
      normalizedMatch: false, expectedWords: 2, observedWords: 0, actionKeyEchoOutputs: 0,
      liveRegionPipeline: emptyLiveRegionPipeline,
    });
  });

  it("should count only standalone action keys actually sent to the speech backend", () => {
    const log = "SPEECH DISPATCHER: Speaking 'tab' as string\nSPEECH DISPATCHER: Speaking '<speak>tab</speak>' \nSPEECH OUTPUT: 'space'";
    expect(diagnoseNativeReaderSpeech(log, "Cancelar solicitud").actionKeyEchoOutputs).toBe(1);
    expect(diagnoseNativeReaderSpeech("SPEECH DISPATCHER: Speaking '<speak>New tab page</speak>'", "Cancelar solicitud").actionKeyEchoOutputs).toBe(0);
  });

  it("should distinguish inactive-document rejection from handling and queue presentation without accepting debug text as speech", () => {
    const log = [
      "OBJECT EVENT: object:text-changed:insert private-contact@synthetic.test",
      "WEB: Live region source is not in active tab.",
      "WEB: Ignoring because live region event not to be handled.",
      "OBJECT EVENT: object:text-changed:insert Aviso esperado",
      "WEB: Event to be handled as live region",
      "vvvvv PRESENT LIVE REGION MESSAGE vvvvv",
      "^^^^^ PRESENT LIVE REGION MESSAGE ^^^^^",
    ].join("\n");
    const expectedPipeline = {
      ...emptyLiveRegionPipeline, textInsertionEntries: 2, handledEntries: 1,
      rejectedEntries: 1, inactiveDocumentEntries: 1, queuePresentationEntries: 1,
    };
    expect(diagnoseNativeLiveRegionPipeline(log)).toEqual(expectedPipeline);
    const diagnostic = diagnoseNativeReaderSpeech(log, "Aviso esperado");
    expect(diagnostic.exactMatch).toBe(false);
    expect(diagnostic.backendLogEntries).toBe(0);
    expect(diagnostic.liveRegionPipeline).toEqual(expectedPipeline);
  });

  it("should count focused alerts, disabled monitoring and page-switch filters without copying their private values", () => {
    const log = [
      "WEB: Focused source will be presented as part of alert private-contact@synthetic.test",
      "INFO: Not presenting message because monitoring is off",
      "WEB: Insertion is believed to be due to page switch",
      "^^^^^ PRESENT LIVE REGION MESSAGE ^^^^^",
    ].join("\r\n");
    expect(diagnoseNativeLiveRegionPipeline(log)).toEqual({
      ...emptyLiveRegionPipeline, focusedAlertEntries: 1,
      monitoringDisabledEntries: 1, pageSwitchInsertionEntries: 1,
    });
    expect(hasNativeReaderSpeech(log, "private-contact@synthetic.test")).toBe(false);
  });

  it("should report an empty pipeline for absent native events", () => {
    expect(diagnoseNativeLiveRegionPipeline("")).toEqual(emptyLiveRegionPipeline);
  });

  it("should recognize the current pinned Orca presenter messages without turning them into speech", () => {
    const log = [
      "WEB: Event is from live region",
      "LIVE REGION PRESENTER: Event from private-document but active document is another-private-document",
      "LIVE REGION PRESENTER: Event is not from a live region.",
      "LIVE REGION PRESENTER: Focused source will be presented as part of alert",
      "LIVE REGION PRESENTER: Live region presenter is not enabled.",
      "vvvvv PRESENT LIVE REGION MESSAGE vvvvv",
    ].join("\n");
    expect(diagnoseNativeLiveRegionPipeline(log)).toEqual({ ...emptyLiveRegionPipeline, handledEntries: 1, rejectedEntries: 1, inactiveDocumentEntries: 1, focusedAlertEntries: 1, presenterDisabledEntries: 1, queuePresentationEntries: 1 });
    expect(hasNativeReaderSpeech(log, "private-document")).toBe(false);
  });

  it("should count each diagnostic line once even when it contains both historical and current markers", () => {
    const log = "WEB: Event to be handled as live region WEB: Event is from live region\nWEB: Event is from live region";
    expect(diagnoseNativeLiveRegionPipeline(log).handledEntries).toBe(2);
  });

  it("should require the visible enabled expected control to hold native focus", () => {
    const target = { focused: true, visible: true, showing: true, enabled: true, editable: false, nameMatchesExpected: true };
    expect(hasNativeReaderTargetFocus({ expectedNodes: [target], focusedNodes: [target] })).toBe(true);
    expect(hasNativeReaderTargetFocus({ expectedNodes: [target], focusedNodes: [] })).toBe(false);
    expect(hasNativeReaderTargetFocus({ expectedNodes: [{ ...target, focused: false }], focusedNodes: [] })).toBe(false);
    expect(hasNativeReaderTargetFocus({ expectedNodes: [{ ...target, showing: false }], focusedNodes: [] })).toBe(false);
    expect(hasNativeReaderTargetFocus({ expectedNodes: [{ ...target, enabled: false }], focusedNodes: [] })).toBe(false);
  });

  it("should reject simultaneous editable browser chrome focus even if the expected web control reports focus", () => {
    const target = { focused: true, visible: true, showing: true, enabled: true, editable: false, nameMatchesExpected: true };
    const addressBar = { ...target, editable: true, nameMatchesExpected: false };
    expect(hasNativeReaderTargetFocus({ expectedNodes: [target], focusedNodes: [target, addressBar] })).toBe(false);
    expect(hasNativeReaderTargetFocus({ expectedNodes: [target], focusedNodes: [target, { ...addressBar, focused: false }] })).toBe(true);
  });

  it("should permit an expected editable control and a noneditable focused ancestor", () => {
    const target = { focused: true, visible: true, showing: true, enabled: true, editable: true, nameMatchesExpected: true };
    const nativeDocument = { ...target, editable: false, nameMatchesExpected: false };
    expect(hasNativeReaderTargetFocus({ expectedNodes: [target], focusedNodes: [nativeDocument, target] })).toBe(true);
  });

  it("should close native focus when the inspector or its focus contract is unavailable", () => {
    expect(hasNativeReaderTargetFocus(null)).toBe(false);
    expect(hasNativeReaderTargetFocus({ unavailable: true })).toBe(false);
    const target = { focused: true, visible: true, showing: true, enabled: true, editable: false, nameMatchesExpected: true };
    expect(hasNativeReaderTargetFocus({ unavailable: true, expectedNodes: [target], focusedNodes: [target] })).toBe(false);
    expect(hasNativeReaderTargetFocus({ expectedNodes: [], focusedNodes: [] })).toBe(false);
    const incomplete = { focused: true, visible: true, showing: true, enabled: true, nameMatchesExpected: true };
    expect(hasNativeReaderTargetFocus({ expectedNodes: [incomplete], focusedNodes: [incomplete] })).toBe(false);
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
