"use client";

/**
 * Free-join form of the story page. It runs the join server action through
 * `useActionState`: a successful join redirects to the tribe, and a rejected
 * or failed one stays on the page with its reason next to the button.
 *
 * @module free-join-form
 */
import { useActionState } from "react";

import { FreeJoinSubmitButton } from "@/components/tribes/tribe-story-about/free-join-submit-button";
import {
  TRIBE_FREE_JOIN_FORM_INITIAL_STATE,
  TRIBE_FREE_JOIN_FORM_STATUS,
  type TribeFreeJoinFormState,
  type TribeFreeJoinFormStatus,
} from "@/src/modules/tribes/constants/tribe-story";
import styles from "./styles.module.scss";

const FREE_JOIN_FORM_FAILURE_COPY = {
  failed: "No pudimos sumarte a la tribu por un problema temporal. Intentá de nuevo en unos segundos.",
  forbidden:
    "El ingreso gratis a esta tribu ya no está disponible para tu cuenta. Recargá la página para ver las opciones vigentes o escribile a quien administra la tribu.",
} as const satisfies Record<Exclude<TribeFreeJoinFormStatus, "idle">, string>;

/** Server action bound to the tribe: it redirects on success and returns why it did not join otherwise. */
export type FreeJoinFormAction = (
  previousState: TribeFreeJoinFormState,
  formData: FormData
) => Promise<TribeFreeJoinFormState>;

type FreeJoinFormProps = {
  /** Join server action bound to the tribe. */
  action: FreeJoinFormAction;
  /** Idle label of the join button. */
  label: string;
  /** Label shown while the join is running. */
  pendingLabel: string;
};

/**
 * Renders the free-join form and the reason of its last failed submit.
 *
 * @param props - Bound action and button labels.
 * @returns Form with the join button and its error.
 */
export function FreeJoinForm({ action, label, pendingLabel }: FreeJoinFormProps) {
  const [state, formAction, isPending] = useActionState(action, TRIBE_FREE_JOIN_FORM_INITIAL_STATE);
  // A retry hides the previous reason until the new answer arrives.
  const failureMessage =
    !isPending && state.status !== TRIBE_FREE_JOIN_FORM_STATUS.idle
      ? FREE_JOIN_FORM_FAILURE_COPY[state.status]
      : null;

  return (
    <form action={formAction} className={styles.FreeJoinForm}>
      <FreeJoinSubmitButton label={label} pendingLabel={pendingLabel} />
      {failureMessage ? (
        <p className={styles.FreeJoinForm__error} role="alert">
          {failureMessage}
        </p>
      ) : null}
    </form>
  );
}
