/** Defines the private HTTP cache, referrer and bounded diagnostic correlation contracts. @module private-http-constants */
export const PRIVATE_RESPONSE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" } as const;
/** Accepts one opaque correlation value, without header lists, URLs, cookies or arbitrary text. */
export const PRIVATE_HTTP_CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
/** Names the single claimed JSON part independently of route input schemas. */
export const PRIVATE_HTTP_INPUT_BODY_PART = "body";
/** Restricts boundary stages to input, own DTO and application operation. */
export const PRIVATE_HTTP_DIAGNOSTIC_STAGE = { input: "input", publicDto: "public_dto", operation: "operation" } as const;
/** Supplies fixed context instead of serializing a rejected value or exception. */
export const PRIVATE_HTTP_BOUNDARY_DIAGNOSTIC_MESSAGE = "Own JSON route boundary rejected an operation";
