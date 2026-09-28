"use client";

import { SubscriptionReturnStatus } from "@/components/subscriptions/subscription-return-status";
import { useSubscriptionReturnStatusPolling } from "@/hooks/use-subscription-return-status-polling";

type SubscriptionReturnStatusContainerProps = {
  providerSubscriptionId: string;
  tribeSlug: string;
};

/**
 * Route-level client container of the Mercado Pago return screen: it owns
 * the status polling and the final navigation, and renders the
 * presentational status with the current phase and the manual retry.
 *
 * @param props - Tribe slug and Mercado Pago preapproval id of the return.
 * @returns The subscription return status screen.
 */
export function SubscriptionReturnStatusContainer({
  providerSubscriptionId,
  tribeSlug,
}: SubscriptionReturnStatusContainerProps) {
  const { phase, retry } = useSubscriptionReturnStatusPolling({
    providerSubscriptionId,
    tribeSlug,
  });

  return <SubscriptionReturnStatus onRetry={retry} phase={phase} />;
}
