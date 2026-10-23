/**
 * Fails the current test when React reports a development warning through the console.
 * React only logs these (controlled/uncontrolled switches, missing keys, updates outside `act`),
 * so without this guard a suite stays green while the browser console fills with them.
 * @module react-warning-guard
 */
import { afterEach, expect } from "vitest";

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

/** One React warning a single test file accepts because it comes from a dependency and cannot be fixed in this repository. */
export type AcceptedReactWarning = {
  /** Text of the accepted warning. */
  readonly pattern: RegExp;
  /** Repository-relative path of the only test file where it is accepted, with forward slashes. */
  readonly testFile: string;
  /** Why the warning cannot be fixed here (dependency and version, upstream issue). */
  readonly reason: string;
};

/**
 * Warnings deliberately accepted, each scoped to one test file. Add an entry only when the warning comes from a dependency
 * and cannot be fixed here; prefer fixing the component.
 */
const ACCEPTED_REACT_WARNINGS: readonly AcceptedReactWarning[] = [];

/** Context of one console call: the running test file and the accepted warnings to apply. */
export type ReactWarningContext = { readonly testPath?: string; readonly accepted?: readonly AcceptedReactWarning[] };

/** @param testPath - Absolute or relative test file path. @returns The path with forward slashes, for platform-independent comparison. */
function normalizeTestPath(testPath: string): string {
  return testPath.replaceAll("\\", "/");
}

/** @param text - Warning text. @param context - Running test file and accepted warnings. @returns Whether that file accepts the warning. */
function isAccepted(text: string, { testPath, accepted = ACCEPTED_REACT_WARNINGS }: ReactWarningContext): boolean {
  if (!testPath) return false;
  const runningFile = normalizeTestPath(testPath);
  return accepted.some((entry) => entry.pattern.test(text) && runningFile.endsWith(`/${entry.testFile}`));
}

const CONSOLE_METHODS = ["error", "warn"] as const;

/** @param argument - One console argument. @returns Its text, including React's `%s` template. */
function describeArgument(argument: unknown): string {
  if (argument instanceof Error) return argument.message;
  return typeof argument === "string" ? argument : "";
}

/**
 * @param consoleArguments - Arguments of one console call. @param context - Running test file and accepted warnings.
 * @returns The React warning text, or null when the call is not one or the running test file accepts it.
 */
export function readReactDevelopmentWarning(consoleArguments: readonly unknown[], context: ReactWarningContext = {}): string | null {
  const text = consoleArguments.map(describeArgument).join(" ");
  const matches = REACT_DEVELOPMENT_WARNING_PATTERNS.some((pattern) => pattern.test(text));
  if (!matches || isAccepted(text, context)) return null;
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
      const warning = readReactDevelopmentWarning(consoleArguments, { testPath: expect.getState().testPath });
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
