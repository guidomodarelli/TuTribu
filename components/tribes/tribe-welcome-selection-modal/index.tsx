"use client";

import { useRef, useState } from "react";
import { ArrowUpRightIcon, LoaderCircleIcon } from "lucide-react";
import { Dialog, DialogContent } from "@golfo/ui";

import type { TribeWelcomeLinkResult } from "@/src/modules/tribes/application/results/tribe-welcome-result";
import { useTribeWelcomeLinkSelection } from "@/hooks/use-tribe-welcome-link-selection";
import { getTribeWelcomeLinkHref } from "@/lib/tribes/tribe-welcome-link-href";
import styles from "./styles.module.scss";

const TRIBE_WELCOME_SELECTION_MODAL_COPY = {
  benefitEyebrow: "Beneficio por seleccionar una opción",
} as const;

/** Button attributes for the option buttons. */
const MODAL_BUTTON = {
  buttonType: "button",
} as const;

type TribeWelcomeSelectionModalProps = {
  benefit?: string | null;
  description: string;
  links: TribeWelcomeLinkResult[];
  onClose?: () => void;
  open: boolean;
  previewOnly?: boolean;
  title: string;
  tribeSlug: string;
};

function getActiveLinks(
  links: TribeWelcomeLinkResult[]
): TribeWelcomeLinkResult[] {
  return links
    .filter((link) => link.isActive)
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
}

type WelcomeLinkSelectionOptions = {
  /** Runs once the selection is recorded and the destination opened. */
  onSelected: () => void;
  previewOnly: boolean;
  tribeSlug: string;
};

/**
 * Records the member's welcome resource choice, one at a time, and opens its
 * destination in a new window (or the current one when popups are blocked).
 * @param options - Tribe, preview mode and the callback after a selection.
 * @returns The id of the link being recorded and the selection handler.
 */
function useWelcomeLinkSelection({
  onSelected,
  previewOnly,
  tribeSlug,
}: WelcomeLinkSelectionOptions) {
  const { pendingLinkId, selectLink } = useTribeWelcomeLinkSelection();

  const handleSelect = async (link: TribeWelcomeLinkResult) => {
    const href = getTribeWelcomeLinkHref(link);

    if (!href) {
      return;
    }

    if (previewOnly) {
      return;
    }

    await selectLink({ href, link, onSelected, tribeSlug });
  };

  return { handleSelect, pendingLinkId };
}

type TribeWelcomeSelectionOptionProps = {
  link: TribeWelcomeLinkResult;
  onSelect: (link: TribeWelcomeLinkResult) => void;
  pendingLinkId: string | null;
};

/**
 * One selectable welcome resource card.
 * @param props - Link, the id of the link being recorded and the select handler.
 * @returns The option list item.
 */
function TribeWelcomeSelectionOption({
  link,
  onSelect,
  pendingLinkId,
}: TribeWelcomeSelectionOptionProps) {
  const isAnyPending = pendingLinkId !== null;
  const isPending = pendingLinkId === link.id;
  const TrailingIcon = isPending ? LoaderCircleIcon : ArrowUpRightIcon;

  return (
    <li
      className={styles.TribeWelcomeSelectionModal__option}
    >
      <button
        aria-busy={isPending || undefined}
        className={styles.TribeWelcomeSelectionModal__optionCard}
        disabled={isAnyPending}
        onClick={() => {
          onSelect(link);
        }}
        type={MODAL_BUTTON.buttonType}
      >
        <span
          className={styles.TribeWelcomeSelectionModal__optionCardText}
        >
          <span
            className={
              styles.TribeWelcomeSelectionModal__optionCardTitle
            }
          >
            {link.label}
          </span>
          {link.description ? (
            <span
              className={
                styles.TribeWelcomeSelectionModal__optionCardDescription
              }
            >
              {link.description}
            </span>
          ) : null}
        </span>
        <TrailingIcon
          aria-hidden
          className={
            isPending
              ? `${styles.TribeWelcomeSelectionModal__optionCardIcon} ${styles["TribeWelcomeSelectionModal__optionCardIcon--pending"]}`
              : styles.TribeWelcomeSelectionModal__optionCardIcon
          }
        />
      </button>
    </li>
  );
}

/**
 * Benefit the member gets for choosing an option.
 * @param props - Benefit copy, if any.
 * @returns The benefit paragraph, or `null`.
 */
function TribeWelcomeSelectionBenefit({
  benefit,
}: Pick<TribeWelcomeSelectionModalProps, "benefit">) {
  if (!benefit) {
    return null;
  }

  return (
    <p className={styles.TribeWelcomeSelectionModal__benefit}>
      <span
        className={styles.TribeWelcomeSelectionModal__benefitEyebrow}
      >
        {TRIBE_WELCOME_SELECTION_MODAL_COPY.benefitEyebrow}
      </span>
      {benefit}
    </p>
  );
}

/**
 * Focus handling of a dialog without a trigger: it opens on the close control
 * and returns focus by hand to whatever was focused before.
 * @returns The close button ref and the open and close auto-focus handlers.
 */
function useWelcomeModalFocus() {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusElementRef = useRef<HTMLElement | null>(null);

  const restoreFocusOnClose = (event: Event) => {
    // The dialog has no Radix trigger, so return focus to whatever opened
    // it (for example the leader's preview button) by hand.
    event.preventDefault();

    const returnFocusElement = returnFocusElementRef.current;

    returnFocusElementRef.current = null;

    if (returnFocusElement?.isConnected) {
      returnFocusElement.focus();
    }
  };

  const focusCloseButtonOnOpen = (event: Event) => {
    // Start on the close control, so a stray Enter never picks an option.
    event.preventDefault();
    returnFocusElementRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();
  };

  return { closeButtonRef, focusCloseButtonOnOpen, restoreFocusOnClose };
}

/**
 * Member-facing modal that asks for a welcome resource the first time the
 * member lands on the welcome page. It is built on the shared `Dialog`, which
 * owns the focus trap, scroll lock, focus restoration and enter/exit motion.
 * `open` seeds the visibility and re-syncs it when the prop changes, so a host
 * can keep the modal mounted and let it play its exit animation.
 */
export function TribeWelcomeSelectionModal({
  benefit,
  description,
  links,
  onClose,
  open,
  previewOnly = false,
  title,
  tribeSlug,
}: TribeWelcomeSelectionModalProps) {
  const activeLinks = getActiveLinks(links);
  const hasActiveLinks = activeLinks.length > 0;
  const [isOpen, setIsOpen] = useState(open && hasActiveLinks);
  const [previousOpen, setPreviousOpen] = useState(open);
  const { closeButtonRef, focusCloseButtonOnOpen, restoreFocusOnClose } =
    useWelcomeModalFocus();
  const hasDescription = description.trim().length > 0;

  // Re-sync when the host toggles `open` while keeping the modal mounted.
  if (previousOpen !== open) {
    setPreviousOpen(open);
    setIsOpen(open && hasActiveLinks);
  }

  const closeModal = () => {
    setIsOpen(false);
    onClose?.();
  };
  const { handleSelect, pendingLinkId } = useWelcomeLinkSelection({
    onSelected: closeModal,
    previewOnly,
    tribeSlug,
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeModal();
        }
      }}
      open={isOpen}
    >
      <DialogContent
        className={styles.TribeWelcomeSelectionModal}
        onCloseAutoFocus={restoreFocusOnClose}
        onOpenAutoFocus={focusCloseButtonOnOpen}
        closeButtonRef={closeButtonRef}
        title={title}
        description={hasDescription ? description : undefined}
        titleClassName={styles.TribeWelcomeSelectionModal__title}
        descriptionClassName={styles.TribeWelcomeSelectionModal__description}
      >
        <TribeWelcomeSelectionBenefit benefit={benefit} />

        <ul className={styles.TribeWelcomeSelectionModal__optionList}>
          {activeLinks.map((link) => {
            const href = getTribeWelcomeLinkHref(link);

            if (!href) {
              return null;
            }

            return (
              <TribeWelcomeSelectionOption
                key={link.id}
                link={link}
                onSelect={(selectedLink) => {
                  void handleSelect(selectedLink);
                }}
                pendingLinkId={pendingLinkId}
              />
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
