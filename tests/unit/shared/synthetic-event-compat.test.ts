import { describe, it, expect } from "vitest";
import { installSyntheticEventCompat } from "@/src/modules/shared/infrastructure/browser/install-synthetic-event-compat";

type CompatEvent = Event & { isPropagationStopped: () => boolean; isDefaultPrevented: () => boolean; persist: () => void };

/** Own prototype per test, so the shared `Event.prototype` stays untouched. */
function compatEventClass() {
  class TestEvent extends Event {}
  installSyntheticEventCompat(TestEvent.prototype);
  return TestEvent;
}

/**
 * @param event - Event to dispatch.
 * @param handler - Listener that inspects it.
 */
function dispatch(event: Event, handler: (event: CompatEvent) => void) {
  const target = new EventTarget();
  target.addEventListener(event.type, (dispatched) => handler(dispatched as CompatEvent));
  target.dispatchEvent(event);
}

describe("installSyntheticEventCompat", () => {
  it("should report a stopped propagation once a handler stopped it, like a React SyntheticEvent", () => {
    const TestEvent = compatEventClass();
    const seen: boolean[] = [];

    dispatch(new TestEvent("click", { bubbles: true }), (event) => {
      seen.push(event.isPropagationStopped());
      event.stopPropagation();
      seen.push(event.isPropagationStopped());
    });

    expect(seen).toEqual([false, true]);
  });

  it("should report a prevented default and accept persist without throwing", () => {
    const TestEvent = compatEventClass();
    const seen: boolean[] = [];

    dispatch(new TestEvent("click", { cancelable: true }), (event) => {
      seen.push(event.isDefaultPrevented());
      event.preventDefault();
      seen.push(event.isDefaultPrevented());
      expect(() => event.persist()).not.toThrow();
    });

    expect(seen).toEqual([false, true]);
  });

  it("should keep a method the prototype already has", () => {
    const own = () => true;
    const target = { isPropagationStopped: own } as unknown as Event;

    installSyntheticEventCompat(target);

    expect((target as CompatEvent).isPropagationStopped).toBe(own);
    expect(typeof (target as CompatEvent).persist).toBe("function");
  });
});
