"use client";

/**
 * Renders member-facing subscription payment states.
 *
 * @module tribe-subscription-payment-status
 */

import { useState } from "react";
import { CreditCardIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import styles from "./styles.module.scss";

const SUBSCRIPTION_PAYMENT_STATUS_COPY = {
  canceledDescription:
    "Tu suscripción fue cancelada. Podés volver a pagar cuando quieras recuperar el acceso.",
  canceledTitle: "Tu suscripción fue cancelada",
  errorFallback: "No pudimos iniciar el pago. Intentá de nuevo.",
  eyebrow: "Suscripción",
  loadingPayment: "Estamos preparando el pago.",
  paymentBlockedDescription:
    "No pudimos confirmar tu pago. Podés volver a pagar con el precio actual.",
  paymentBlockedTitle: "Volvé a activar tu suscripción",
  pausedDescription:
    "Tu suscripción está pausada. Cuando vuelva a estar activa, vas a poder entrar de nuevo.",
  pausedTitle: "Tu suscripción está pausada",
  pendingDescription:
    "Estamos esperando confirmación de pago. Te vamos a habilitar el acceso cuando Mercado Pago confirme la suscripción.",
  pendingTitle: "Estamos esperando confirmación de pago",
  retryPaymentButton: "Volver a pagar",
} as const;

const SUBSCRIPTION_PAYMENT_STATUS_REQUEST = {
  apiTribes: "/api/tribes/",
  buttonType: "button",
  jsonContentType: "application/json",
  postMethod: "POST",
  startSubscriptionSegment: "/subscriptions/start",
  statusRole: "status",
} as const;

const SUBSCRIPTION_PAYMENT_STATUS_CONTENT = {
  [TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled]: {
    description: SUBSCRIPTION_PAYMENT_STATUS_COPY.canceledDescription,
    title: SUBSCRIPTION_PAYMENT_STATUS_COPY.canceledTitle,
  },
  [TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused]: {
    description: SUBSCRIPTION_PAYMENT_STATUS_COPY.pausedDescription,
    title: SUBSCRIPTION_PAYMENT_STATUS_COPY.pausedTitle,
  },
  [TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked]: {
    description: SUBSCRIPTION_PAYMENT_STATUS_COPY.paymentBlockedDescription,
    title: SUBSCRIPTION_PAYMENT_STATUS_COPY.paymentBlockedTitle,
  },
  [TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending]: {
    description: SUBSCRIPTION_PAYMENT_STATUS_COPY.pendingDescription,
    title: SUBSCRIPTION_PAYMENT_STATUS_COPY.pendingTitle,
  },
} as const;

type SubscriptionPaymentStatus =
  keyof typeof SUBSCRIPTION_PAYMENT_STATUS_CONTENT;

const SUBSCRIPTION_PAYMENT_RETRY_STATUSES: ReadonlySet<SubscriptionPaymentStatus> =
  new Set([
    TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
    TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked,
  ]);

type TribeSubscriptionPaymentStatusProps = {
  subscriptionStatus: SubscriptionPaymentStatus;
  tribeSlug: string;
};

type SubscriptionStartResponse = {
  checkoutUrl?: string;
  message?: string;
};

function resolveSubscriptionStartErrorMessage(
  body: SubscriptionStartResponse
): string {
  return body.message ?? SUBSCRIPTION_PAYMENT_STATUS_COPY.errorFallback;
}

function buildStartSubscriptionEndpoint(tribeSlug: string): string {
  return (
    SUBSCRIPTION_PAYMENT_STATUS_REQUEST.apiTribes +
    tribeSlug +
    SUBSCRIPTION_PAYMENT_STATUS_REQUEST.startSubscriptionSegment
  );
}

export function TribeSubscriptionPaymentStatus({
  subscriptionStatus,
  tribeSlug,
}: TribeSubscriptionPaymentStatusProps) {
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const statusContent = SUBSCRIPTION_PAYMENT_STATUS_CONTENT[subscriptionStatus];
  const canRetryPayment =
    SUBSCRIPTION_PAYMENT_RETRY_STATUSES.has(subscriptionStatus);

  const handleRetryPayment = async () => {
    setIsStartingPayment(true);
    setFeedbackMessage(SUBSCRIPTION_PAYMENT_STATUS_COPY.loadingPayment);

    try {
      const response = await fetch(buildStartSubscriptionEndpoint(tribeSlug), {
        body: JSON.stringify({}),
        headers: {
          "Content-Type": SUBSCRIPTION_PAYMENT_STATUS_REQUEST.jsonContentType,
        },
        method: SUBSCRIPTION_PAYMENT_STATUS_REQUEST.postMethod,
      });
      const body = (await response.json().catch(() => ({}))) as
        SubscriptionStartResponse;

      if (!response.ok || !body.checkoutUrl) {
        setFeedbackMessage(resolveSubscriptionStartErrorMessage(body));

        return;
      }

      window.location.assign(body.checkoutUrl);
    } catch {
      setFeedbackMessage(SUBSCRIPTION_PAYMENT_STATUS_COPY.errorFallback);
    } finally {
      setIsStartingPayment(false);
    }
  };

  return (
    <section className={styles.TribeSubscriptionPaymentStatus}>
      <p className={styles.TribeSubscriptionPaymentStatus__eyebrow}>
        {SUBSCRIPTION_PAYMENT_STATUS_COPY.eyebrow}
      </p>
      <h1 className={styles.TribeSubscriptionPaymentStatus__title}>
        {statusContent.title}
      </h1>
      <p className={styles.TribeSubscriptionPaymentStatus__description}>
        {statusContent.description}
      </p>
      {feedbackMessage ? (
        <p
          className={styles.TribeSubscriptionPaymentStatus__feedback}
          role={SUBSCRIPTION_PAYMENT_STATUS_REQUEST.statusRole}
        >
          {feedbackMessage}
        </p>
      ) : null}
      {canRetryPayment ? (
        <Button
          disabled={isStartingPayment}
          onClick={() => {
            void handleRetryPayment();
          }}
          type={SUBSCRIPTION_PAYMENT_STATUS_REQUEST.buttonType}
        >
          <CreditCardIcon />
          {SUBSCRIPTION_PAYMENT_STATUS_COPY.retryPaymentButton}
        </Button>
      ) : null}
    </section>
  );
}
