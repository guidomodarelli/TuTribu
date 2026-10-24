/** @vitest-environment node */
/** Checks only own observation transitions; no browser, SDK or native platform is mocked. */
import { describe, expect, it } from "vitest";
import { waitForAdmissionNativeTargetFocus } from "./wait-admission-reader-native-focus.mjs";
import { ADMISSION_READER_PROBE } from "./constants/admission-reader-probe.mjs";

const target = { focused: true, visible: true, showing: true, enabled: true, editable: true, nameMatchesExpected: true };
const ready = { expectedNodes: [target], focusedNodes: [target] };
const notShowing = { expectedNodes: [{ ...target, showing: false }], focusedNodes: [{ ...target, showing: false }] };

describe("native target focus settling", () => {
  it("waits for the existing visibility predicate while the same DOM target retains focus", async () => {
    let clock = 0;
    const result = await waitForAdmissionNativeTargetFocus({ readDomFocus: async () => true, inspectFocus: () => clock === 0 ? notShowing : ready, nowMs: () => clock, pause: async () => { clock += ADMISSION_READER_PROBE.pollMs; } });
    expect(result.focused).toBe(true);
    expect(result.observation).toEqual(ready);
    expect(result.domFocusRetained).toBe(true);
    expect(result.elapsedMs).toBeGreaterThan(0);
  });

  it("keeps a nonshowing native target rejected at the bounded deadline", async () => {
    let clock = 0;
    const result = await waitForAdmissionNativeTargetFocus({ readDomFocus: async () => true, inspectFocus: () => notShowing, nowMs: () => clock, pause: async () => { clock += ADMISSION_READER_PROBE.pollMs; } });
    expect(result.focused).toBe(false);
    expect(result.observation).toEqual(notShowing);
    expect(result.elapsedMs).toBe(ADMISSION_READER_PROBE.focusSettleTimeoutMs);
  });

  it("rejects a native match if DOM focus was lost during the observation", async () => {
    let domFocused = true;
    const result = await waitForAdmissionNativeTargetFocus({ readDomFocus: async () => domFocused, inspectFocus: () => { domFocused = false; return ready; }, nowMs: () => 0, pause: async () => undefined });
    expect(result.focused).toBe(false);
    expect(result.domFocusRetained).toBe(false);
  });
});
