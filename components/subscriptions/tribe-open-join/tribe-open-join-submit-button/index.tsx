"use client";

/**
 * Submit button for the public-join checkout form that reflects the pending
 * server action, so the member gets immediate feedback and cannot start the
 * checkout twice while the redirect to Mercado Pago is on its way.
 *
 * @module tribe-open-join-submit-button
 */
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "beez-ui";

import styles from "./styles.module.scss";

const TRIBE_OPEN_JOIN_SUBMIT_BUTTON_TYPE = "submit";

type TribeOpenJoinSubmitButtonProps = {
  /** Idle label of the submit action. */
  children: ReactNode;
  /** Label shown while the checkout server action is running. */
  pendingLabel: string;
};

/**
 * Renders the checkout submit button bound to the parent form status.
 *
 * @param props - Idle content and pending label.
 * @returns Submit button that disables itself while the form is pending.
 */
export function TribeOpenJoinSubmitButton({
  children,
  pendingLabel,
}: TribeOpenJoinSubmitButtonProps) {
  const { pending: isPending } = useFormStatus();

  return (
    <Button
      aria-busy={isPending || undefined}
      className={styles.TribeOpenJoinSubmitButton}
      disabled={isPending}
      type={TRIBE_OPEN_JOIN_SUBMIT_BUTTON_TYPE}
    >
      {isPending ? (
        <>
          <LoaderCircleIcon
            aria-hidden
            className={styles.TribeOpenJoinSubmitButton__spinner}
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
