"use client";

/**
 * Renders member-facing subscription payment states.
 *
 * @module tribe-subscription-payment-status
 */

import { useRef, useState } from "react";
import { CreditCardIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "beez-ui";
import { PresenceSwap } from "@/components/motion/presence-swap";
import { navigateToUrl } from "@/lib/browser-navigation";
import { joinClassNames } from "@/lib/motion/join-class-names";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import styles from "./styles.module.scss";

const SUBSCRIPTION_PAYMENT_STATUS_COPY = {
  canceledDescription:
    "Tu suscripción fue cancelada. Podés volver a pagar cuando quieras recuperar el acceso.",
  canceledTitle: "Tu suscripción fue cancelada",
  errorFallback: "No pudimos iniciar el pago. Intentá de nuevo.",
  eyebrow: "Suscripción",
  loadingAction: "Un momento, te llevamos al siguiente paso.",
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

/** Tone of the inline feedback; also keys its enter/exit transition. */
const SUBSCRIPTION_PAYMENT_FEEDBACK_TONE = {
  error: "error",
  progress: "progress",
} as const;

const SUBSCRIPTION_PAYMENT_STATUS_LOG = {
  retryFailed: "TribeSubscriptionPaymentStatus:handleRetryPayment failed",
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

type SubscriptionPaymentFeedbackTone =
  (typeof SUBSCRIPTION_PAYMENT_FEEDBACK_TONE)[keyof typeof SUBSCRIPTION_PAYMENT_FEEDBACK_TONE];

type SubscriptionPaymentFeedback = {
  message: string;
  tone: SubscriptionPaymentFeedbackTone;
};

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
  subscriptionUrl?: string;
};

/**
 * Resolves the safe message shown when the checkout could not start.
 *
 * @param body - Parsed start-subscription response body.
 * @returns Server-provided safe message or the Spanish fallback.
 */
function resolveSubscriptionStartErrorMessage(
  body: SubscriptionStartResponse
): string {
  return body.message ?? SUBSCRIPTION_PAYMENT_STATUS_COPY.errorFallback;
}

/**
 * Builds the same-origin endpoint that starts a subscription checkout.
 *
 * @param tribeSlug - Tribe slug.
 * @returns Relative endpoint path.
 */
function buildStartSubscriptionEndpoint(tribeSlug: string): string {
  return (
    SUBSCRIPTION_PAYMENT_STATUS_REQUEST.apiTribes +
    tribeSlug +
    SUBSCRIPTION_PAYMENT_STATUS_REQUEST.startSubscriptionSegment
  );
}

/**
 * Renders the member-facing payment state and, when allowed, a retry action
 * that starts a new checkout and hands the browser off to Mercado Pago.
 *
 * @param props - Current subscription status and tribe slug.
 * @returns Subscription payment status section.
 */
export function TribeSubscriptionPaymentStatus({
  subscriptionStatus,
  tribeSlug,
}: TribeSubscriptionPaymentStatusProps) {
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [feedback, setFeedback] = useState<SubscriptionPaymentFeedback | null>(
    null
  );
  // Guards against a second click landing before the disabled state renders.
  const isStartingPaymentRef = useRef(false);
  const statusContent = SUBSCRIPTION_PAYMENT_STATUS_CONTENT[subscriptionStatus];
  const canRetryPayment =
    SUBSCRIPTION_PAYMENT_RETRY_STATUSES.has(subscriptionStatus);

  const failPaymentStart = (message: string) => {
    isStartingPaymentRef.current = false;
    setIsStartingPayment(false);
    setFeedback({ message, tone: SUBSCRIPTION_PAYMENT_FEEDBACK_TONE.error });
  };

  const handleRetryPayment = async () => {
    if (isStartingPaymentRef.current) {
      return;
    }

    isStartingPaymentRef.current = true;
    setIsStartingPayment(true);
    setFeedback({
      message: SUBSCRIPTION_PAYMENT_STATUS_COPY.loadingAction,
      tone: SUBSCRIPTION_PAYMENT_FEEDBACK_TONE.progress,
    });

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

      // On success the action stays disabled while the browser leaves for the
      // checkout, so a second tap cannot start another one mid-redirect.
      if (response.ok && body.subscriptionUrl) {
        navigateToUrl(body.subscriptionUrl);

        return;
      }

      if (!response.ok || !body.checkoutUrl) {
        failPaymentStart(resolveSubscriptionStartErrorMessage(body));

        return;
      }

      navigateToUrl(body.checkoutUrl);
    } catch (error) {
      console.error(
        SUBSCRIPTION_PAYMENT_STATUS_LOG.retryFailed,
        { tribeSlug },
        error
      );
      failPaymentStart(SUBSCRIPTION_PAYMENT_STATUS_COPY.errorFallback);
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
      {/* Kept mounted so assistive technology announces each message change. */}
      <div
        className={styles.TribeSubscriptionPaymentStatus__feedbackRegion}
        role={SUBSCRIPTION_PAYMENT_STATUS_REQUEST.statusRole}
      >
        {feedback ? (
          <PresenceSwap presenceKey={feedback.tone + feedback.message}>
            <p
              className={joinClassNames(
                styles.TribeSubscriptionPaymentStatus__feedback,
                feedback.tone === SUBSCRIPTION_PAYMENT_FEEDBACK_TONE.error &&
                  styles["TribeSubscriptionPaymentStatus__feedback--error"]
              )}
            >
              {feedback.message}
            </p>
          </PresenceSwap>
        ) : null}
      </div>
      {canRetryPayment ? (
        <Button
          aria-busy={isStartingPayment || undefined}
          className={styles.TribeSubscriptionPaymentStatus__action}
          disabled={isStartingPayment}
          onClick={() => {
            void handleRetryPayment();
          }}
          type={SUBSCRIPTION_PAYMENT_STATUS_REQUEST.buttonType}
        >
          {isStartingPayment ? (
            <LoaderCircleIcon
              aria-hidden
              className={styles.TribeSubscriptionPaymentStatus__spinner}
            />
          ) : (
            <CreditCardIcon aria-hidden />
          )}
          {SUBSCRIPTION_PAYMENT_STATUS_COPY.retryPaymentButton}
        </Button>
      ) : null}
    </section>
  );
}
