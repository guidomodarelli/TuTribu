/**
 * Client operation keys of the event mutations that must not duplicate on a
 * retry (for now, publishing a conversation comment).
 */

const UUID_BYTE_LENGTH = 16;
const UUID_VERSION_BYTE_INDEX = 6;
const UUID_VARIANT_BYTE_INDEX = 8;
const UUID_VERSION_CLEAR_MASK = 0x0f;
const UUID_VERSION_4_BITS = 0x40;
const UUID_VARIANT_CLEAR_MASK = 0x3f;
const UUID_VARIANT_RFC_4122_BITS = 0x80;
const HEX_RADIX = 16;
const HEX_BYTE_WIDTH = 2;
const HEX_PAD_CHARACTER = "0";

/**
 * Splits the 32 hex digits into the canonical UUID groups (8-4-4-4-12).
 */
const UUID_GROUPS_PATTERN = /^(.{8})(.{4})(.{4})(.{4})(.{12})$/;
const UUID_GROUPS_REPLACEMENT = "$1-$2-$3-$4-$5";

/**
 * Builds a UUID v4 from `crypto.getRandomValues`, which (unlike
 * `crypto.randomUUID`) also exists outside secure contexts and on older
 * WebKit builds.
 */
function createUuidFromRandomValues(): string {
  const uuidBytes = globalThis.crypto.getRandomValues(new Uint8Array(UUID_BYTE_LENGTH));

  uuidBytes[UUID_VERSION_BYTE_INDEX] =
    (uuidBytes[UUID_VERSION_BYTE_INDEX] & UUID_VERSION_CLEAR_MASK) | UUID_VERSION_4_BITS;
  uuidBytes[UUID_VARIANT_BYTE_INDEX] =
    (uuidBytes[UUID_VARIANT_BYTE_INDEX] & UUID_VARIANT_CLEAR_MASK) | UUID_VARIANT_RFC_4122_BITS;

  const hexDigits = Array.from(uuidBytes, (uuidByte) =>
    uuidByte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, HEX_PAD_CHARACTER)
  ).join("");

  return hexDigits.replace(UUID_GROUPS_PATTERN, UUID_GROUPS_REPLACEMENT);
}

/**
 * New client request id (UUID v4) for one send attempt. Callers keep it and
 * send it again on every retry of the same operation.
 *
 * @returns A UUID v4 string.
 */
export function createTribeEventClientRequestId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : createUuidFromRandomValues();
}
