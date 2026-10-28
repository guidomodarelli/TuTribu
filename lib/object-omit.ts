/**
 * Shallow object helpers for building a payload without some of its keys.
 *
 * @module object-omit
 */

/** `Omit` applied to each member of a union, so discriminated unions keep their members. */
export type DistributiveOmit<Value, Key extends PropertyKey> = Value extends unknown
  ? Omit<Value, Key>
  : never;

/**
 * Copies the own enumerable string-keyed properties of `value`, except the
 * given keys. Same result as `const { key, ...rest } = value` without
 * declaring a variable for the discarded key.
 *
 * @param value - Source object; it is not modified.
 * @param keys - Keys left out of the copy.
 * @returns A new object without the omitted keys.
 */
export function omitKeys<Value extends object, Key extends keyof Value & string>(
  value: Value,
  keys: readonly Key[]
): DistributiveOmit<Value, Key> {
  const omittedKeys = new Set<string>(keys);

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omittedKeys.has(key))
  ) as DistributiveOmit<Value, Key>;
}
