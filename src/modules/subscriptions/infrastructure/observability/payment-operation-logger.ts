/**
 * Provides structured payment operation logs with provider-safe identifiers.
 *
 * @module payment-operation-logger
 */

import { createHash } from "crypto";

import {
  createServerLogger,
  type ServerLogLevel,
} from "@/src/modules/shared/infrastructure/observability/server-logger";

export type PaymentOperationTraceContext = {
  operationKey: string;
  preapprovalId?: string | null;
  priceId?: string | null;
  providerPlanId?: string | null;
  requestId?: string | null;
  tribeSlug?: string | null;
};

type PaymentOperationLogInput = {
  context?: PaymentOperationTraceContext;
  error?: unknown;
  level?: ServerLogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  operation: string;
  preapprovalId?: string | null;
  providerPlanId?: string | null;
  result: string;
};

const PAYMENT_OPERATION_LOG = {
  feature: "subscriptions",
} as const;

const PAYMENT_PROVIDER_IDENTIFIER_REDACTION = {
  algorithm: "sha256",
  hashLength: 12,
  prefix: "[redacted:",
  suffix: "]",
} as const;

/**
 * Redacts a provider identifier while preserving a stable correlation hash.
 *
 * @param providerIdentifier - Provider identifier that must not be logged raw.
 * @returns Redacted identifier with a short hash, or null when absent.
 */
export function redactPaymentProviderIdentifier(
  providerIdentifier: string | null | undefined
): string | null {
  if (!providerIdentifier) {
    return null;
  }

  const identifierHash = createHash(
    PAYMENT_PROVIDER_IDENTIFIER_REDACTION.algorithm
  )
    .update(providerIdentifier)
    .digest("hex")
    .slice(0, PAYMENT_PROVIDER_IDENTIFIER_REDACTION.hashLength);

  return (
    PAYMENT_PROVIDER_IDENTIFIER_REDACTION.prefix +
    identifierHash +
    PAYMENT_PROVIDER_IDENTIFIER_REDACTION.suffix
  );
}

/**
 * Adds a metadata property only when the value is useful for traceability.
 *
 * @param metadata - Mutable metadata object being prepared for logging.
 * @param key - Metadata property name.
 * @param value - Optional metadata value.
 * @returns Metadata object with the optional value applied.
 */
function addMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
  value: unknown
): Record<string, unknown> {
  if (value !== undefined && value !== null && value !== "") {
    metadata[key] = value;
  }

  return metadata;
}

/**
 * Builds safe payment metadata with redacted provider identifiers.
 *
 * @param input - Payment operation log input.
 * @returns Structured metadata ready for the server logger.
 */
function buildPaymentOperationMetadata(
  input: PaymentOperationLogInput
): Record<string, unknown> {
  const context = input.context;
  const metadata: Record<string, unknown> = {
    operation_key: context?.operationKey,
    requestId: context?.requestId,
    result: input.result,
    ...input.metadata,
  };

  addMetadataValue(metadata, "priceId", context?.priceId);
  addMetadataValue(metadata, "tribeSlug", context?.tribeSlug);
  addMetadataValue(
    metadata,
    "providerPlanId",
    redactPaymentProviderIdentifier(
      input.providerPlanId ?? context?.providerPlanId
    )
  );
  addMetadataValue(
    metadata,
    "preapprovalId",
    redactPaymentProviderIdentifier(
      input.preapprovalId ?? context?.preapprovalId
    )
  );

  return metadata;
}

/**
 * Writes a structured payment operation log when request context is available.
 *
 * @param input - Operation, trace context, result, and optional diagnostics.
 * @returns Nothing.
 */
export function logPaymentOperation(input: PaymentOperationLogInput): void {
  const requestId = input.context?.requestId;

  if (!requestId) {
    return;
  }

  const logger = createServerLogger({
    feature: PAYMENT_OPERATION_LOG.feature,
    operation: input.operation,
    requestId,
  });
  const level = input.level ?? "info";

  logger[level]({
    error: input.error,
    message: input.message,
    metadata: buildPaymentOperationMetadata(input),
  });
}
