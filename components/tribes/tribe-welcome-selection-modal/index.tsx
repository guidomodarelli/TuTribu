"use client";

import { useRef, useState } from "react";
import { ArrowUpRightIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import {
  toast,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "beez-ui";

import type { TribeWelcomeLinkResult } from "@/src/modules/tribes/application/results/tribe-welcome-result";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";
import styles from "./styles.module.scss";

const TRIBE_WELCOME_SELECTION_MODAL_COPY = {
  benefitEyebrow: "Beneficio por seleccionar una opción",
  closeLabel: "Cerrar",
  fallbackError:
    "No pudimos registrar tu elección. Probá de nuevo en unos minutos.",
} as const;

const SELECTION_REQUEST = {
  apiPrefix: "/api/tribes/",
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  postMethod: "POST",
  selectionsSegment: "/welcome/selections",
} as const;

const WHATSAPP_LINK = {
  baseUrl: "https://wa.me/",
  messageQueryName: "text",
  querySeparator: "?",
  valueSeparator: "=",
} as const;

const PHONE_NUMBER_NON_DIGIT_PATTERN = /\D/g;

/** Button attributes for the modal close control and the option buttons. */
const MODAL_BUTTON = {
  buttonType: "button",
  closeSize: "icon-sm",
  closeVariant: "ghost",
} as const;

const SELECTION_WINDOW_OPEN = {
  blankUrl: "about:blank",
  target: "_blank",
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

function buildWhatsappUrl(link: TribeWelcomeLinkResult): string | null {
  if (
    link.type !== TRIBE_WELCOME_LINK_TYPE.whatsappButton ||
    !link.phoneNumber
  ) {
    return null;
  }

  const normalizedPhoneNumber = link.phoneNumber.replace(
    PHONE_NUMBER_NON_DIGIT_PATTERN,
    ""
  );
  const messageQuery = link.message
    ? WHATSAPP_LINK.querySeparator +
      WHATSAPP_LINK.messageQueryName +
      WHATSAPP_LINK.valueSeparator +
      encodeURIComponent(link.message)
    : "";

  return WHATSAPP_LINK.baseUrl + normalizedPhoneNumber + messageQuery;
}

function getLinkHref(link: TribeWelcomeLinkResult): string | null {
  return link.type === TRIBE_WELCOME_LINK_TYPE.whatsappButton
    ? buildWhatsappUrl(link)
    : link.url;
}

function openDestinationWindow(): Window | null {
  const openedWindow = window.open(
    SELECTION_WINDOW_OPEN.blankUrl,
    SELECTION_WINDOW_OPEN.target
  );

  if (openedWindow) {
    openedWindow.opener = null;
  }

  return openedWindow;
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
  const [pendingLinkId, setPendingLinkId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingSelectionRef = useRef(false);
  const returnFocusElementRef = useRef<HTMLElement | null>(null);
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

  const handleSelect = async (link: TribeWelcomeLinkResult) => {
    if (pendingSelectionRef.current) {
      return;
    }

    const href = getLinkHref(link);

    if (!href) {
      return;
    }

    if (previewOnly) {
      return;
    }

    const destinationWindow = openDestinationWindow();

    pendingSelectionRef.current = true;
    setPendingLinkId(link.id);

    try {
      const response = await fetch(
        SELECTION_REQUEST.apiPrefix +
          encodeURIComponent(tribeSlug) +
          SELECTION_REQUEST.selectionsSegment,
        {
          body: JSON.stringify({ welcomeLinkId: link.id }),
          headers: {
            [SELECTION_REQUEST.contentTypeHeader]:
              SELECTION_REQUEST.jsonContentType,
          },
          method: SELECTION_REQUEST.postMethod,
        }
      );

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        toast.error(
          errorPayload?.message ||
            TRIBE_WELCOME_SELECTION_MODAL_COPY.fallbackError
        );
        destinationWindow?.close();
        return;
      }

      if (destinationWindow) {
        destinationWindow.location.href = href;
      } else {
        window.location.assign(href);
      }

      closeModal();
    } catch {
      destinationWindow?.close();
      toast.error(TRIBE_WELCOME_SELECTION_MODAL_COPY.fallbackError);
    } finally {
      pendingSelectionRef.current = false;
      setPendingLinkId(null);
    }
  };

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
        // Without a description Radix must not point at a missing element.
        {...(hasDescription ? {} : { "aria-describedby": undefined })}
        className={styles.TribeWelcomeSelectionModal}
        onCloseAutoFocus={(event) => {
          // The dialog has no Radix trigger, so return focus to whatever opened
          // it (for example the leader's preview button) by hand.
          event.preventDefault();

          const returnFocusElement = returnFocusElementRef.current;

          returnFocusElementRef.current = null;

          if (returnFocusElement?.isConnected) {
            returnFocusElement.focus();
          }
        }}
        onOpenAutoFocus={(event) => {
          // Start on the close control, so a stray Enter never picks an option.
          event.preventDefault();
          returnFocusElementRef.current =
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
              ? document.activeElement
              : null;
          closeButtonRef.current?.focus();
        }}
        showCloseButton={false}
      >
        <header className={styles.TribeWelcomeSelectionModal__header}>
          <DialogTitle className={styles.TribeWelcomeSelectionModal__title}>
            {title}
          </DialogTitle>
          <DialogClose asChild>
            <Button
              aria-label={TRIBE_WELCOME_SELECTION_MODAL_COPY.closeLabel}
              className={styles.TribeWelcomeSelectionModal__close}
              ref={closeButtonRef}
              size={MODAL_BUTTON.closeSize}
              type={MODAL_BUTTON.buttonType}
              variant={MODAL_BUTTON.closeVariant}
            >
              <XIcon aria-hidden />
            </Button>
          </DialogClose>
        </header>

        {hasDescription ? (
          <DialogDescription
            className={styles.TribeWelcomeSelectionModal__description}
          >
            {description}
          </DialogDescription>
        ) : null}

        {benefit ? (
          <p className={styles.TribeWelcomeSelectionModal__benefit}>
            <span
              className={styles.TribeWelcomeSelectionModal__benefitEyebrow}
            >
              {TRIBE_WELCOME_SELECTION_MODAL_COPY.benefitEyebrow}
            </span>
            {benefit}
          </p>
        ) : null}

        <ul className={styles.TribeWelcomeSelectionModal__optionList}>
          {activeLinks.map((link) => {
            const href = getLinkHref(link);

            if (!href) {
              return null;
            }

            const isAnyPending = pendingLinkId !== null;
            const isPending = pendingLinkId === link.id;
            const TrailingIcon = isPending ? LoaderCircleIcon : ArrowUpRightIcon;

            return (
              <li
                className={styles.TribeWelcomeSelectionModal__option}
                key={link.id}
              >
                <button
                  aria-busy={isPending || undefined}
                  className={styles.TribeWelcomeSelectionModal__optionCard}
                  disabled={isAnyPending}
                  onClick={() => {
                    void handleSelect(link);
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
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
