/**
 * Gives native browser events the SyntheticEvent methods that React passes to handlers.
 *
 * TanStack Redact (the browser React runtime, see `next.config.ts`) hands handlers the
 * native `Event` with only a `nativeEvent` alias. Radix RadioGroup, Checkbox, Switch and
 * Select call `event.isPropagationStopped()` inside their handlers; without it the
 * handler throws before the choice is applied, so the control never changes.
 *
 * @module install-synthetic-event-compat
 */

/** Native methods that stop propagation; each one records it so `isPropagationStopped` can report it. */
const STOP_METHODS = ["stopPropagation", "stopImmediatePropagation"] as const;

/** Events whose propagation a handler stopped; weak, so finished events are collected. */
const stoppedEvents = new WeakSet<Event>();

/** SyntheticEvent methods the native event lacks, reading what the handlers already did. */
const SYNTHETIC_EVENT_METHODS: Record<string, (this: Event) => boolean | void> = {
  isPropagationStopped() { return stoppedEvents.has(this); },
  isDefaultPrevented() { return this.defaultPrevented; },
  // Events are never pooled, so there is nothing to keep.
  persist() {},
};

/**
 * Adds each missing SyntheticEvent method to the event prototype; methods that already exist are kept.
 *
 * @param target - Prototype every dispatched event inherits from, `Event.prototype` in the browser.
 */
export function installSyntheticEventCompat(target: Event): void {
  if (!("isPropagationStopped" in target)) {
    for (const name of STOP_METHODS) {
      const native = target[name];
      define(target, name, function stop(this: Event) { stoppedEvents.add(this); native.call(this); });
    }
  }
  for (const [name, method] of Object.entries(SYNTHETIC_EVENT_METHODS)) {
    if (!(name in target)) define(target, name, method);
  }
}

/**
 * @param target - Event prototype.
 * @param name - Method name.
 * @param value - Method body.
 */
function define(target: Event, name: string, value: (this: Event) => boolean | void): void {
  Object.defineProperty(target, name, { value, configurable: true, writable: true });
}
