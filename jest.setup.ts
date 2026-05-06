import "@testing-library/jest-dom";

const RELATIVE_TIME_ELEMENT_TAG = "relative-time";

if (
  globalThis.customElements &&
  !globalThis.customElements.get(RELATIVE_TIME_ELEMENT_TAG)
) {
  globalThis.customElements.define(
    RELATIVE_TIME_ELEMENT_TAG,
    class RelativeTimeElementTestStub extends HTMLElement {}
  );
}

global.fetch = jest.fn();
