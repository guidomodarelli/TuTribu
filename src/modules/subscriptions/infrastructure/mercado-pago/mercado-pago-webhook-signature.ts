/**
 * Verifies Mercado Pago webhook signatures.
 *
 * @module mercado-pago-webhook-signature
 */

import { createHmac, timingSafeEqual } from "crypto";

import {
  MILLISECONDS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from "@/src/constants/time";

const MERCADO_PAGO_WEBHOOK_ENV = {
  secret: "MERCADO_PAGO_WEBHOOK_SECRET",
} as const;

const MERCADO_PAGO_WEBHOOK_HEADER = {
  requestId: "x-request-id",
  signature: "x-signature",
} as const;

const MERCADO_PAGO_WEBHOOK_SIGNATURE = {
  algorithm: "sha256",
  hexEncoding: "hex",
  partSeparator: ",",
  timestampKey: "ts",
  valueSeparator: "=",
  versionOneKey: "v1",
} as const;

const WEBHOOK_TIMESTAMP_TOLERANCE_MINUTES = 5;
const WEBHOOK_TIMESTAMP = {
  millisecondsLength: 13,
  secondsMultiplier: MILLISECONDS_PER_SECOND,
  toleranceMilliseconds:
    WEBHOOK_TIMESTAMP_TOLERANCE_MINUTES *
    SECONDS_PER_MINUTE *
    MILLISECONDS_PER_SECOND,
} as const;

type ParsedWebhookSignature = {
  timestamp: string;
  versionOneSignature: string;
};

/**
 * Verifies the Mercado Pago HMAC signature for a webhook payload.
 *
 * @param input - Request headers and resource identifier used in the manifest.
 * @returns Whether the notification is authentic and fresh.
 */
export function verifyMercadoPagoWebhookSignature(input: {
  headers: Headers;
  resourceId: string;
}): boolean {
  const webhookSecret = process.env[MERCADO_PAGO_WEBHOOK_ENV.secret];
  const signatureHeader = input.headers.get(MERCADO_PAGO_WEBHOOK_HEADER.signature);
  const requestId = input.headers.get(MERCADO_PAGO_WEBHOOK_HEADER.requestId);
  const parsedSignature = parseWebhookSignature(signatureHeader);

  if (
    !webhookSecret ||
    !requestId ||
    !input.resourceId ||
    !parsedSignature ||
    !isFreshWebhookTimestamp(parsedSignature.timestamp)
  ) {
    return false;
  }

  const manifest = [
    `id:${input.resourceId.trim().toLowerCase()};`,
    `request-id:${requestId};`,
    `ts:${parsedSignature.timestamp};`,
  ].join("");
  const expectedSignature = createHmac(
    MERCADO_PAGO_WEBHOOK_SIGNATURE.algorithm,
    webhookSecret
  )
    .update(manifest)
    .digest(MERCADO_PAGO_WEBHOOK_SIGNATURE.hexEncoding);

  return safeCompareHex(parsedSignature.versionOneSignature, expectedSignature);
}

/**
 * Parses the Mercado Pago x-signature header into its supported parts.
 *
 * @param signatureHeader - Raw x-signature header value.
 * @returns Parsed timestamp and v1 signature, or null.
 */
function parseWebhookSignature(
  signatureHeader: string | null
): ParsedWebhookSignature | null {
  if (!signatureHeader) {
    return null;
  }

  const signatureParts = signatureHeader
    .split(MERCADO_PAGO_WEBHOOK_SIGNATURE.partSeparator)
    .map((part) => part.trim().split(MERCADO_PAGO_WEBHOOK_SIGNATURE.valueSeparator));
  const timestamp = signatureParts.find(
    ([key]) => key === MERCADO_PAGO_WEBHOOK_SIGNATURE.timestampKey
  )?.[1];
  const versionOneSignature = signatureParts.find(
    ([key]) => key === MERCADO_PAGO_WEBHOOK_SIGNATURE.versionOneKey
  )?.[1];

  return timestamp && versionOneSignature
    ? {
        timestamp,
        versionOneSignature,
      }
    : null;
}

/**
 * Rejects stale signed webhook timestamps.
 *
 * @param timestamp - Mercado Pago timestamp in seconds or milliseconds.
 * @returns Whether the timestamp is within the accepted tolerance.
 */
function isFreshWebhookTimestamp(timestamp: string): boolean {
  const timestampNumber = Number(timestamp);

  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  const timestampMilliseconds =
    timestamp.length >= WEBHOOK_TIMESTAMP.millisecondsLength
      ? timestampNumber
      : timestampNumber * WEBHOOK_TIMESTAMP.secondsMultiplier;

  return (
    Math.abs(Date.now() - timestampMilliseconds) <=
    WEBHOOK_TIMESTAMP.toleranceMilliseconds
  );
}

/**
 * Compares hex signatures without leaking timing differences.
 *
 * @param receivedValue - Untrusted received hex value.
 * @param expectedValue - Expected hex value.
 * @returns Whether both values are equal.
 */
function safeCompareHex(receivedValue: string, expectedValue: string): boolean {
  const receivedBuffer = Buffer.from(
    receivedValue,
    MERCADO_PAGO_WEBHOOK_SIGNATURE.hexEncoding
  );
  const expectedBuffer = Buffer.from(
    expectedValue,
    MERCADO_PAGO_WEBHOOK_SIGNATURE.hexEncoding
  );

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}
