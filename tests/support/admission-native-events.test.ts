/** @vitest-environment node */
/** Validates the own diagnostic payload without mocking AT-SPI or browser libraries. */
import { describe, expect, it } from "vitest";
import { parseAdmissionNativeEventObservation } from "./admission-native-events.mjs";
import { ADMISSION_READER_EVENTS } from "./constants/admission-reader-events.mjs";

/** @returns Plain own-protocol input, containing no native source objects or text. */
function report() {
  return { protocolVersion: ADMISSION_READER_EVENTS.protocolVersion, scope: ADMISSION_READER_EVENTS.scope, registeredEvents: ADMISSION_READER_EVENTS.eventTypes, completion: "stopped", observedEvents: 2, readFailures: 0, droppedEvents: 0, groups: [
    { eventType: ADMISSION_READER_EVENTS.eventTypes[0], application: ADMISSION_READER_EVENTS.applicationGroups.browser, toolkit: "gtk", roleId: 1, liveRegion: false, payloadIsText: true, expectedTextInPayload: false, maximumDataLength: 1, count: 1 },
    { eventType: ADMISSION_READER_EVENTS.eventTypes[1], application: ADMISSION_READER_EVENTS.applicationGroups.other, toolkit: "webkit", roleId: 1, liveRegion: true, payloadIsText: true, expectedTextInPayload: true, maximumDataLength: 1, count: 1 },
  ] };
}

describe("passive native event payload", () => {
  it("separates expected text in an announcement from unrelated text insertion", () => {
    const observed = parseAdmissionNativeEventObservation(JSON.stringify(report()));
    expect(observed.observedEvents).toBe(2);
    expect(observed.expectedTextSignals).toBe(1);
    expect(observed.expectedMainApplicationTextSignals).toBe(0);
    expect(observed.complete).toBe(true);
  });

  it("rejects a worker payload containing private source text", () => {
    expect(() => parseAdmissionNativeEventObservation(JSON.stringify({ ...report(), privateText: "private event content" }))).toThrow();
  });

  it("rejects inconsistent totals instead of presenting lost events as complete", () => {
    expect(() => parseAdmissionNativeEventObservation(JSON.stringify({ ...report(), observedEvents: 1 }))).toThrow();
  });

  it("reports a partial observation when the native source could not be read", () => {
    const observed = parseAdmissionNativeEventObservation(JSON.stringify({ ...report(), readFailures: 1 }));
    expect(observed.complete).toBe(false);
  });

  it("rejects an unregistered event type instead of widening the stated observation scope", () => {
    const value = report(); value.groups[0].eventType = "unregistered:private-event";
    expect(() => parseAdmissionNativeEventObservation(JSON.stringify(value))).toThrow();
  });

  it("keeps an observation partial if its own deadline ended before the owner stopped it", () => {
    expect(parseAdmissionNativeEventObservation(JSON.stringify({ ...report(), completion: ADMISSION_READER_EVENTS.completions.deadline })).complete).toBe(false);
  });

  it("rejects duplicate groups rather than inflating the expected-text signal count", () => {
    const value = report(); value.groups[1] = { ...value.groups[0] };
    expect(() => parseAdmissionNativeEventObservation(JSON.stringify(value))).toThrow();
  });

  it("keeps a matching payload from another application separate from the main browser", () => {
    const value = report(); value.groups[1].application = ADMISSION_READER_EVENTS.applicationGroups.browser;
    expect(parseAdmissionNativeEventObservation(JSON.stringify(value)).expectedMainApplicationTextSignals).toBe(1);
  });

  it("rejects private application names inside a group", () => {
    const value = report();
    expect(() => parseAdmissionNativeEventObservation(JSON.stringify({ ...value, groups: [{ ...value.groups[0], applicationName: "private application name" }, value.groups[1]] }))).toThrow();
  });
});
