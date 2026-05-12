/**
 * Provides application use cases for aggregate tribe subscriber diagnostics.
 *
 * @module manage-tribe-subscriber-diagnostics-use-cases
 */

import type {
  TribeSubscriberDiagnosticsQuery,
  TribeSubscriberDiagnosticsRepository,
} from "@/src/modules/subscriptions/application/ports/tribe-subscriber-diagnostics-repository";

type TribeSubscriberDiagnosticsDependencies = {
  tribeSubscriberDiagnosticsRepository: TribeSubscriberDiagnosticsRepository;
};

/**
 * Normalizes route text values before they cross into the repository port.
 *
 * @param value - Text value received from a route or page.
 * @returns Trimmed text value.
 */
function normalizeText(value: string): string {
  return value.trim();
}

/**
 * Reads local aggregate subscriber diagnostics without calling Mercado Pago.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that reads local subscriber diagnostics.
 */
export function getTribeSubscriberDiagnostics({
  tribeSubscriberDiagnosticsRepository,
}: TribeSubscriberDiagnosticsDependencies) {
  return async (query: TribeSubscriberDiagnosticsQuery) =>
    tribeSubscriberDiagnosticsRepository.getSubscriberDiagnostics({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}

/**
 * Reconciles aggregate subscriber diagnostics against Mercado Pago on demand.
 *
 * @param dependencies - Repository dependencies for the use case.
 * @returns Executable use case that reconciles subscriber diagnostics.
 */
export function reconcileTribeSubscriberDiagnostics({
  tribeSubscriberDiagnosticsRepository,
}: TribeSubscriberDiagnosticsDependencies) {
  return async (query: TribeSubscriberDiagnosticsQuery) =>
    tribeSubscriberDiagnosticsRepository.reconcileSubscriberDiagnostics({
      tribeSlug: normalizeText(query.tribeSlug),
    });
}
