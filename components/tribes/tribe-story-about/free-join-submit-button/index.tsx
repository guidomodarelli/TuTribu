"use client";

/**
 * Submit button for the story page free-join form. It reflects the pending
 * server action so the visitor gets immediate feedback and cannot submit the
 * join twice while the membership is being created.
 *
 * @module free-join-submit-button
 */
import { useFormStatus } from "react-dom";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "beez-ui";

import styles from "./styles.module.scss";

const FREE_JOIN_SUBMIT_BUTTON_TYPE = "submit";

type FreeJoinSubmitButtonProps = {
  /** Idle label of the join action. */
  label: string;
  /** Label shown while the join server action is running. */
  pendingLabel: string;
};

/**
 * Renders the free-join submit button bound to the parent form status.
 *
 * @param props - Idle and pending labels.
 * @returns Submit button that disables itself while the form is pending.
 */
export function FreeJoinSubmitButton({
  label,
  pendingLabel,
}: FreeJoinSubmitButtonProps) {
  const { pending: isPending } = useFormStatus();

  return (
    <Button
      aria-busy={isPending || undefined}
      className={styles.FreeJoinSubmitButton}
      disabled={isPending}
      type={FREE_JOIN_SUBMIT_BUTTON_TYPE}
    >
      {isPending ? (
        <>
          <LoaderCircleIcon
            aria-hidden
            className={styles.FreeJoinSubmitButton__spinner}
          />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
