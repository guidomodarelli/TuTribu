"use client";

/**
 * Renders member subscription self-management controls.
 *
 * @module tribe-subscription-self-management
 */

import { useState } from "react";
import { XCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import styles from "./styles.module.scss";

const SUBSCRIPTION_SELF_MANAGEMENT_COPY = {
  cancelButton: "Cancelar suscripción",
  canceledDescription:
    "Tu suscripción fue cancelada y el acceso a la tribu quedó removido.",
  canceledTitle: "Suscripción cancelada",
  confirmButton: "Confirmar cancelación",
  confirmMessage:
    "Confirmá la cancelación para aplicar el cambio en Mercado Pago y remover el acceso.",
  description:
    "Podés cancelar tu suscripción mensual. El cambio se aplica en Mercado Pago y remueve tu acceso a la tribu.",
  errorFallback: "No pudimos cancelar la suscripción. Intentá de nuevo.",
  eyebrow: "Suscripción",
  statusLabel: "Estado",
  title: "Gestionar suscripción",
} as const;

const SUBSCRIPTION_STATUS_COPY = {
  [TRIBE_MEMBER_SUBSCRIPTION_STATUS.active]: "activa",
  [TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled]: "cancelada",
  [TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused]: "pausada",
  [TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending]: "pendiente",
  [TRIBE_MEMBER_SUBSCRIPTION_STATUS.removedBySubscription]: "removida",
} as const;

const SUBSCRIPTION_SELF_MANAGEMENT_REQUEST = {
  apiTribes: "/api/tribes/",
  buttonType: "button",
  currentSubscriptionSegment: "/subscriptions/current",
  deleteMethod: "DELETE",
  destructiveVariant: "destructive",
  statusRole: "status",
} as const;

type TribeSubscriptionSelfManagementProps = {
  subscriptionStatus: keyof typeof SUBSCRIPTION_STATUS_COPY;
  tribeSlug: string;
};

type SubscriptionCancellationResponse = {
  message?: string;
};

function buildCurrentSubscriptionEndpoint(tribeSlug: string): string {
  return (
    SUBSCRIPTION_SELF_MANAGEMENT_REQUEST.apiTribes +
    tribeSlug +
    SUBSCRIPTION_SELF_MANAGEMENT_REQUEST.currentSubscriptionSegment
  );
}

export function TribeSubscriptionSelfManagement({
  subscriptionStatus,
  tribeSlug,
}: TribeSubscriptionSelfManagementProps) {
  const [isCanceling, setIsCanceling] = useState(false);
  const [isConfirmingCancellation, setIsConfirmingCancellation] =
    useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hasCanceled, setHasCanceled] = useState(false);

  const handleCancelSubscription = async () => {
    if (!isConfirmingCancellation) {
      setIsConfirmingCancellation(true);
      setStatusMessage(SUBSCRIPTION_SELF_MANAGEMENT_COPY.confirmMessage);

      return;
    }

    setIsCanceling(true);
    setStatusMessage(SUBSCRIPTION_SELF_MANAGEMENT_COPY.confirmMessage);

    try {
      const response = await fetch(buildCurrentSubscriptionEndpoint(tribeSlug), {
        method: SUBSCRIPTION_SELF_MANAGEMENT_REQUEST.deleteMethod,
      });
      const body = (await response.json().catch(() => ({}))) as
        SubscriptionCancellationResponse;

      if (!response.ok) {
        throw new Error(
          body.message ?? SUBSCRIPTION_SELF_MANAGEMENT_COPY.errorFallback
        );
      }

      const message =
        body.message ?? SUBSCRIPTION_SELF_MANAGEMENT_COPY.canceledDescription;

      setHasCanceled(true);
      setIsConfirmingCancellation(false);
      setStatusMessage(message);
      toast.success(message);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : SUBSCRIPTION_SELF_MANAGEMENT_COPY.errorFallback;

      setStatusMessage(message);
      toast.error(message);
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <section className={styles.TribeSubscriptionSelfManagement}>
      <p className={styles.TribeSubscriptionSelfManagement__eyebrow}>
        {SUBSCRIPTION_SELF_MANAGEMENT_COPY.eyebrow}
      </p>
      <h1 className={styles.TribeSubscriptionSelfManagement__title}>
        {hasCanceled
          ? SUBSCRIPTION_SELF_MANAGEMENT_COPY.canceledTitle
          : SUBSCRIPTION_SELF_MANAGEMENT_COPY.title}
      </h1>
      <p className={styles.TribeSubscriptionSelfManagement__description}>
        {hasCanceled
          ? SUBSCRIPTION_SELF_MANAGEMENT_COPY.canceledDescription
          : SUBSCRIPTION_SELF_MANAGEMENT_COPY.description}
      </p>
      <p className={styles.TribeSubscriptionSelfManagement__status}>
        {SUBSCRIPTION_SELF_MANAGEMENT_COPY.statusLabel}:{" "}
        {SUBSCRIPTION_STATUS_COPY[subscriptionStatus]}
      </p>
      {statusMessage ? (
        <p
          className={styles.TribeSubscriptionSelfManagement__status}
          role={SUBSCRIPTION_SELF_MANAGEMENT_REQUEST.statusRole}
        >
          {statusMessage}
        </p>
      ) : null}
      <Button
        disabled={isCanceling || hasCanceled}
        onClick={() => {
          void handleCancelSubscription();
        }}
        type={SUBSCRIPTION_SELF_MANAGEMENT_REQUEST.buttonType}
        variant={SUBSCRIPTION_SELF_MANAGEMENT_REQUEST.destructiveVariant}
      >
        <XCircleIcon />
        {isConfirmingCancellation
          ? SUBSCRIPTION_SELF_MANAGEMENT_COPY.confirmButton
          : SUBSCRIPTION_SELF_MANAGEMENT_COPY.cancelButton}
      </Button>
    </section>
  );
}
