/**
 * Readers of loosely typed JSON request bodies shared by the route handlers
 * that validate fields by hand (the use cases validate the values).
 *
 * @module request-body-fields
 */

/**
 * Reads a field that may be omitted.
 *
 * @param body - Parsed JSON body.
 * @param field - Field name to read.
 * @returns The raw value, or `undefined` when the body has no such field.
 */
export function readBodyField(body: unknown, field: string): unknown {
  if (!body || typeof body !== "object" || !(field in body)) {
    return undefined;
  }

  return (body as Record<string, unknown>)[field];
}

/**
 * Reads a string field from an unknown JSON body.
 *
 * @param body - Parsed JSON body.
 * @param field - Field name to read.
 * @returns String field value or an empty string.
 */
export function readStringField(body: unknown, field: string): string {
  const value = readBodyField(body, field);

  return typeof value === "string" ? value : "";
}

/**
 * Reads an optional string field without collapsing omitted fields.
 *
 * @param body - Parsed JSON body.
 * @param field - Field name to read.
 * @returns String field value, an empty string for invalid provided values,
 * or `undefined` when omitted.
 */
export function readOptionalStringField(body: unknown, field: string): string | undefined {
  if (!body || typeof body !== "object" || !(field in body)) {
    return undefined;
  }

  return readStringField(body, field);
}

const HTTP_URL_PROTOCOL = {
  http: "http:",
  https: "https:",
} as const;

/**
 * Whether a parsed JSON body is a plain object (not null nor an array).
 *
 * @param value - Parsed JSON value.
 * @returns `true` for a plain object.
 */
export function isPayloadObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reads a JSON request body that must be a plain object.
 *
 * @param request - Incoming request.
 * @returns The body object, or `null` when the body is unreadable or not a plain object.
 */
export async function readPayloadObjectBody(
  request: Request
): Promise<Record<string, unknown> | null> {
  const parsedBody: unknown = await request.json().catch(() => ({}));

  return isPayloadObject(parsedBody) ? parsedBody : null;
}

/**
 * Reads a non-blank text value, trimmed.
 *
 * @param value - Raw field value.
 * @returns The trimmed text, or `null` when it is not a non-blank string.
 */
export function readTrimmedText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Whether a text is an absolute `http:` or `https:` URL.
 *
 * @param value - Text to check.
 * @returns `true` for a parseable http(s) URL.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);

    return (
      parsedUrl.protocol === HTTP_URL_PROTOCOL.http ||
      parsedUrl.protocol === HTTP_URL_PROTOCOL.https
    );
  } catch {
    return false;
  }
}
