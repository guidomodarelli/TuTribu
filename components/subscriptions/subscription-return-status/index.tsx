"use client";

import { Button } from "beez-ui";

import {
  SUBSCRIPTION_RETURN_POLLING_PHASE,
  type SubscriptionReturnPollingPhase,
} from "@/lib/subscriptions/subscription-return-polling";
import styles from "./styles.module.scss";

const SUBSCRIPTION_RETURN_COPY = {
  checking: {
    description:
      "Mercado Pago nos está avisando el resultado. En unos segundos vas a poder volver a entrar a la tribu.",
    title: "Estamos confirmando tu suscripción",
  },
  exhausted: {
    description:
      "Mercado Pago puede tardar unos minutos más en avisarnos. Si ya pagaste, no hace falta volver a pagar: actualizá el estado en un rato.",
    title: "Todavía no recibimos la confirmación",
  },
  eyebrow: "Suscripción",
  retryButton: "Actualizar estado",
} as const;

const SUBSCRIPTION_RETURN_LIVE_REGION = "polite";

type SubscriptionReturnStatusProps = {
  /** Starts a new round of automatic checks. */
  onRetry: () => void;
  phase: SubscriptionReturnPollingPhase;
};

/**
 * Renders the Mercado Pago return state: a busy live region while the
 * confirmation is checked, and a manual refresh once automatic checks stop.
 *
 * @param props - Current polling phase and the manual retry callback.
 * @returns Subscription return status section.
 */
export function SubscriptionReturnStatus({
  onRetry,
  phase,
}: SubscriptionReturnStatusProps) {
  const isChecking = phase === SUBSCRIPTION_RETURN_POLLING_PHASE.checking;
  const copy = isChecking
    ? SUBSCRIPTION_RETURN_COPY.checking
    : SUBSCRIPTION_RETURN_COPY.exhausted;

  return (
    <section
      aria-busy={isChecking}
      aria-live={SUBSCRIPTION_RETURN_LIVE_REGION}
      className={styles.SubscriptionReturnStatus}
    >
      <p className={styles.SubscriptionReturnStatus__eyebrow}>
        {SUBSCRIPTION_RETURN_COPY.eyebrow}
      </p>
      <h1 className={styles.SubscriptionReturnStatus__title}>{copy.title}</h1>
      <p className={styles.SubscriptionReturnStatus__description}>
        {copy.description}
      </p>
      {isChecking ? null : (
        <div className={styles.SubscriptionReturnStatus__actions}>
          <Button onClick={onRetry} type="button">
            {SUBSCRIPTION_RETURN_COPY.retryButton}
          </Button>
        </div>
      )}
    </section>
  );
}
