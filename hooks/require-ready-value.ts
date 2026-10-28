/** Guard for values a hook step only reaches once they exist. @module require-ready-value */

/**
 * @param value - A value the caller only reaches once it exists.
 * @param name - What the value is, for the error message.
 * @returns The same value; a missing one fails with a `TypeError`, as reading a property of it would.
 */
export function requireReadyValue<Value>(value: Value | null | undefined, name: string): Value {
  if (value === null || value === undefined) throw new TypeError(`${name} unavailable`);
  return value;
}
