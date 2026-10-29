import { Button, cn } from "@golfo/ui";
import styles from "./styles.module.scss";

const TRIBE_EVENT_FORM_ACTIONS_COPY = {
  cancelButton: "Cancelar",
} as const;

const BUTTON_ATTRIBUTE = {
  typeButton: "button",
  typeSubmit: "submit",
  variantGhost: "ghost",
} as const;

type TribeEventFormActionsProps = {
  /** Extra class of the action row, for spacing owned by the dialog. */
  className?: string;
  isSaving: boolean;
  onClose: () => void;
  /** Label of the submit button while the form is being saved. */
  savingLabel: string;
  submitLabel: string;
};

/**
 * Cancel and submit buttons of an event dialog form; submit is disabled while
 * the form is being saved.
 * @param props - Row class, saving state, close handler and submit labels.
 * @returns The action row.
 */
export function TribeEventFormActions({
  className,
  isSaving,
  onClose,
  savingLabel,
  submitLabel,
}: TribeEventFormActionsProps) {
  return (
    <div className={cn(styles.TribeEventFormActions, className)}>
      <Button
        type={BUTTON_ATTRIBUTE.typeButton}
        variant={BUTTON_ATTRIBUTE.variantGhost}
        onClick={onClose}
      >
        {TRIBE_EVENT_FORM_ACTIONS_COPY.cancelButton}
      </Button>
      <Button disabled={isSaving} type={BUTTON_ATTRIBUTE.typeSubmit}>
        {isSaving ? savingLabel : submitLabel}
      </Button>
    </div>
  );
}
