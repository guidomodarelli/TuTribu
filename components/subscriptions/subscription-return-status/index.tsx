"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import styles from "./styles.module.scss";

const SUBSCRIPTION_RETURN_REFRESH_INTERVAL_MS = 3_000;

const SUBSCRIPTION_RETURN_COPY = {
  description:
    "Mercado Pago nos está avisando el resultado. En unos segundos vas a poder volver a entrar a la tribu.",
  eyebrow: "Suscripción",
  title: "Estamos confirmando tu suscripción",
} as const;

const SUBSCRIPTION_RETURN_ACCESSIBILITY = {
  busy: "true",
  live: "polite",
} as const;

/**
 * Renders the Mercado Pago return state and refreshes the route until access changes.
 *
 * @returns Subscription return status section.
 */
export function SubscriptionReturnStatus() {
  const { refresh } = useRouter();

  useEffect(() => {
    const refreshIntervalId = window.setInterval(() => {
      refresh();
    }, SUBSCRIPTION_RETURN_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(refreshIntervalId);
    };
  }, [refresh]);

  return (
    <section
      aria-busy={SUBSCRIPTION_RETURN_ACCESSIBILITY.busy}
      aria-live={SUBSCRIPTION_RETURN_ACCESSIBILITY.live}
      className={styles.SubscriptionReturnStatus}
    >
      <p className={styles.SubscriptionReturnStatus__eyebrow}>
        {SUBSCRIPTION_RETURN_COPY.eyebrow}
      </p>
      <h1 className={styles.SubscriptionReturnStatus__title}>
        {SUBSCRIPTION_RETURN_COPY.title}
      </h1>
      <p className={styles.SubscriptionReturnStatus__description}>
        {SUBSCRIPTION_RETURN_COPY.description}
      </p>
    </section>
  );
}
