"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";

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

const MODAL_ARIA = {
  ariaHiddenTrue: "true",
  ariaModalTrue: "true",
  describedBy: "tribe-welcome-selection-modal-description",
  labelledBy: "tribe-welcome-selection-modal-title",
  role: "dialog",
} as const;

const MODAL_BUTTON = {
  buttonType: "button",
} as const;

const MODAL_KEY = {
  escape: "Escape",
  tab: "Tab",
} as const;

const MODAL_EVENT = {
  keydown: "keydown",
} as const;

const MODAL_FOCUSABLE_ELEMENT_SELECTOR = {
  anchor: "a[href]",
  button: "button:not(:disabled)",
  input: "input:not(:disabled)",
  select: "select:not(:disabled)",
  tabIndex: '[tabindex]:not([tabindex="-1"])',
  textarea: "textarea:not(:disabled)",
} as const;

const MODAL_FOCUSABLE_SELECTOR_SEPARATOR = ", ";

const MODAL_FOCUSABLE_SELECTOR = Object.values(
  MODAL_FOCUSABLE_ELEMENT_SELECTOR
).join(MODAL_FOCUSABLE_SELECTOR_SEPARATOR);

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

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)
  );
}

export function TribeWelcomeSelectionModal({
  benefit,
  description,
  links,
  onClose,
  open: initiallyOpen,
  previewOnly = false,
  title,
  tribeSlug,
}: TribeWelcomeSelectionModalProps) {
  const activeLinks = getActiveLinks(links);
  const hasActiveLinks = activeLinks.length > 0;
  const [isOpen, setIsOpen] = useState(initiallyOpen && hasActiveLinks);
  const [pendingLinkId, setPendingLinkId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const pendingSelectionRef = useRef(false);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === MODAL_KEY.escape) {
        closeModal();
        return;
      }

      if (event.key !== MODAL_KEY.tab || !modalRef.current) {
        return;
      }

      const focusableElements = getFocusableElements(modalRef.current);
      const firstFocusableElement = focusableElements.at(0);
      const lastFocusableElement = focusableElements.at(-1);

      if (!firstFocusableElement || !lastFocusableElement) {
        event.preventDefault();
        return;
      }

      const activeElement = document.activeElement;

      if (!modalRef.current.contains(activeElement)) {
        event.preventDefault();
        firstFocusableElement.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    };

    document.addEventListener(MODAL_EVENT.keydown, handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener(MODAL_EVENT.keydown, handleKeyDown);
    };
  }, [closeModal, isOpen]);

  if (!isOpen) {
    return null;
  }

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
    <div
      aria-describedby={MODAL_ARIA.describedBy}
      aria-labelledby={MODAL_ARIA.labelledBy}
      aria-modal={MODAL_ARIA.ariaModalTrue}
      className={styles.TribeWelcomeSelectionModal}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeModal();
        }
      }}
      ref={modalRef}
      role={MODAL_ARIA.role}
    >
      <div className={styles.TribeWelcomeSelectionModal__dialog}>
        <header className={styles.TribeWelcomeSelectionModal__header}>
          <h2
            className={styles.TribeWelcomeSelectionModal__title}
            id={MODAL_ARIA.labelledBy}
          >
            {title}
          </h2>
          <button
            aria-label={TRIBE_WELCOME_SELECTION_MODAL_COPY.closeLabel}
            className={styles.TribeWelcomeSelectionModal__close}
            onClick={closeModal}
            ref={closeButtonRef}
            type={MODAL_BUTTON.buttonType}
          >
            <XIcon aria-hidden={MODAL_ARIA.ariaHiddenTrue} />
          </button>
        </header>

        <p
          className={styles.TribeWelcomeSelectionModal__description}
          id={MODAL_ARIA.describedBy}
        >
          {description}
        </p>

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

            return (
              <li
                className={styles.TribeWelcomeSelectionModal__option}
                key={link.id}
              >
                <button
                  className={styles.TribeWelcomeSelectionModal__optionCard}
                  disabled={isAnyPending}
                  onClick={() => handleSelect(link)}
                  type={MODAL_BUTTON.buttonType}
                >
                  <span className={styles.TribeWelcomeSelectionModal__optionCardTitle}>
                    {link.label}
                  </span>
                  {link.description ? (
                    <p className={styles.TribeWelcomeSelectionModal__optionCardDescription}>
                      {link.description}
                    </p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

      </div>
    </div>
  );
}
