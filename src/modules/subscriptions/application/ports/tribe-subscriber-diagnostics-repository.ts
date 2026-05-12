/**
 * Defines the application port for aggregate subscriber diagnostics.
 *
 * @module tribe-subscriber-diagnostics-repository
 */

import type {
  TribeSubscriberDiagnosticsReconciliationResult,
  TribeSubscriberDiagnosticsResult,
} from "@/src/modules/subscriptions/application/results/tribe-subscription-price-result";

export type TribeSubscriberDiagnosticsQuery = {
  tribeSlug: string;
};

export type TribeSubscriberDiagnosticsRepository = {
  getSubscriberDiagnostics(
    query: TribeSubscriberDiagnosticsQuery
  ): Promise<TribeSubscriberDiagnosticsResult | null>;
  reconcileSubscriberDiagnostics(
    query: TribeSubscriberDiagnosticsQuery
  ): Promise<TribeSubscriberDiagnosticsReconciliationResult>;
};
