/**
 * Fails the current test when React reports a development warning through the console.
 * React only logs these (controlled/uncontrolled switches, missing keys, updates outside `act`),
 * so without this guard a suite stays green while the browser console fills with them.
 * @module react-warning-guard
 */
import { afterEach } from "vitest";

/** Development warnings React logs instead of throwing; each one is a real bug in the rendered component. */
export const REACT_DEVELOPMENT_WARNING_PATTERNS: readonly RegExp[] = [
  /is changing (?:from )?(?:an )?uncontrolled .*to (?:be )?controlled/i,
  /is changing (?:from )?(?:a )?controlled .*to (?:be )?uncontrolled/i,
  /Each child in a list should have a unique "key" prop/,
  /Encountered two children with the same key/,
  /was not wrapped in act\(/,
  /Cannot update a component .* while rendering a different component/,
  /Maximum update depth exceeded/,
  /React does not recognize the .* prop on a DOM element/,
  /Received `(?:true|false)` for a non-boolean attribute/,
  /Invalid DOM property/,
];

/**
 * Warnings a suite has deliberately accepted. Add an entry only with the file it applies to and why it cannot be fixed there;
 * prefer fixing the component.
 */
const ACCEPTED_REACT_WARNING_PATTERNS: readonly RegExp[] = [];

const CONSOLE_METHODS = ["error", "warn"] as const;

/** @param argument - One console argument. @returns Its text, including React's `%s` template. */
function describeArgument(argument: unknown): string {
  if (argument instanceof Error) return argument.message;
  return typeof argument === "string" ? argument : "";
}

/** @param consoleArguments - Arguments of one console call. @returns The React warning text, or null when the call is not one. */
export function readReactDevelopmentWarning(consoleArguments: readonly unknown[]): string | null {
  const text = consoleArguments.map(describeArgument).join(" ");
  const matches = REACT_DEVELOPMENT_WARNING_PATTERNS.some((pattern) => pattern.test(text));
  if (!matches || ACCEPTED_REACT_WARNING_PATTERNS.some((pattern) => pattern.test(text))) return null;
  return text;
}

/**
 * Wraps `console.error` and `console.warn` once per test file and fails the test that produced a React warning.
 * The wrapper still forwards every call, so spies installed by a test keep observing it, and a test that silences
 * the console on purpose (`mockImplementation`) silences the guard too.
 */
export function installReactWarningGuard(): void {
  const warnings: string[] = [];
  for (const method of CONSOLE_METHODS) {
    const original = console[method].bind(console);
    console[method] = (...consoleArguments: unknown[]) => {
      const warning = readReactDevelopmentWarning(consoleArguments);
      if (warning) warnings.push(warning);
      original(...consoleArguments);
    };
  }
  afterEach(() => {
    if (warnings.length === 0) return;
    const reported = warnings.splice(0);
    throw new Error(`React development warnings were logged during this test; fix the component instead of ignoring them:\n- ${reported.join("\n- ")}`);
  });
}
