"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import type {
  TribeWelcomeLinkResult,
  TribeWelcomeResult,
  TribeWelcomeRuleResult,
} from "@/src/modules/tribes/application/results/tribe-welcome-result";
import {
  TRIBE_WELCOME_LINK_TYPE,
} from "@/src/modules/tribes/constants/tribe-welcome";
import styles from "./styles.module.scss";

const TRIBE_WELCOME_DISPLAY_COPY = {
  agreementsHeading: "Acuerdos de convivencia",
  benefitEyebrow: "Beneficio",
  defaultHeading: "Bienvenido/a",
  fallbackError:
    "No pudimos registrar tu elección. Probá de nuevo en unos minutos.",
} as const;

const WHATSAPP_LINK = {
  baseUrl: "https://wa.me/",
  messageQueryName: "text",
  querySeparator: "?",
  valueSeparator: "=",
} as const;

const TRIBE_WELCOME_DISPLAY_ATTRIBUTES = {
  agreementsTitleId: "tribe-welcome-agreements-title",
  blankTarget: "_blank",
  buttonType: "button",
  linksTitleId: "tribe-welcome-links-title",
  noreferrerRel: "noreferrer",
} as const;

const SELECTION_REQUEST = {
  apiPrefix: "/api/tribes/",
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  postMethod: "POST",
  selectionsSegment: "/welcome/selections",
} as const;

const SELECTION_WINDOW_OPEN = {
  blankUrl: "about:blank",
  target: "_blank",
} as const;

const PHONE_NUMBER_NON_DIGIT_PATTERN = /\D/g;

type TribeWelcomeDisplayProps = {
  action?: React.ReactNode;
  tribeSlug?: string;
  welcome: TribeWelcomeResult;
};

function getActiveRules(rules: TribeWelcomeRuleResult[]) {
  return rules.filter((rule) => rule.isActive);
}

function getActiveLinks(links: TribeWelcomeLinkResult[]) {
  return links.filter((link) => link.isActive);
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

export function TribeWelcomeDisplay({
  action,
  tribeSlug,
  welcome,
}: TribeWelcomeDisplayProps) {
  const activeRules = getActiveRules(welcome.rules);
  const activeLinks = getActiveLinks(welcome.links);
  const [pendingLinkId, setPendingLinkId] = useState<string | null>(null);
  const pendingSelectionRef = useRef(false);

  const handleSelect = async (
    link: TribeWelcomeLinkResult,
    href: string
  ): Promise<void> => {
    if (!tribeSlug || pendingSelectionRef.current) {
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
          errorPayload?.message || TRIBE_WELCOME_DISPLAY_COPY.fallbackError
        );
        destinationWindow?.close();
        return;
      }

      if (destinationWindow) {
        destinationWindow.location.href = href;
      } else {
        window.location.assign(href);
      }
    } catch {
      destinationWindow?.close();
      toast.error(TRIBE_WELCOME_DISPLAY_COPY.fallbackError);
    } finally {
      pendingSelectionRef.current = false;
      setPendingLinkId(null);
    }
  };

  const renderLinkCard = (link: TribeWelcomeLinkResult, href: string) => {
    const content = (
      <>
        <span className={styles.TribeWelcomeDisplay__linkCardTitle}>
          {link.label}
        </span>
        {link.description ? (
          <p className={styles.TribeWelcomeDisplay__linkCardDescription}>
            {link.description}
          </p>
        ) : null}
      </>
    );

    if (!tribeSlug) {
      return (
        <a
          className={styles.TribeWelcomeDisplay__linkCard}
          href={href}
          rel={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.noreferrerRel}
          target={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.blankTarget}
        >
          {content}
        </a>
      );
    }

    return (
      <button
        className={styles.TribeWelcomeDisplay__linkCard}
        disabled={pendingLinkId !== null}
        onClick={() => {
          void handleSelect(link, href);
        }}
        type={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.buttonType}
      >
        {content}
      </button>
    );
  };

  return (
    <section className={styles.TribeWelcomeDisplay}>
      <header className={styles.TribeWelcomeDisplay__header}>
        <p className={styles.TribeWelcomeDisplay__eyebrow}>
          Antes de empezar
        </p>
        <h1 className={styles.TribeWelcomeDisplay__title}>
          {TRIBE_WELCOME_DISPLAY_COPY.defaultHeading}
        </h1>
        <p className={styles.TribeWelcomeDisplay__message}>
          {welcome.welcomeMessage}
        </p>
      </header>

      {activeRules.length > 0 ? (
        <section
          aria-labelledby={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.agreementsTitleId}
          className={styles.TribeWelcomeDisplay__section}
        >
          <h2
            className={styles.TribeWelcomeDisplay__sectionTitle}
            id={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.agreementsTitleId}
          >
            {TRIBE_WELCOME_DISPLAY_COPY.agreementsHeading}
          </h2>
          <ol className={styles.TribeWelcomeDisplay__ruleList}>
            {activeRules.map((rule) => (
              <li
                className={styles.TribeWelcomeDisplay__ruleItem}
                key={rule.id}
              >
                {rule.label}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {activeLinks.length > 0 ? (
        <section
          aria-labelledby={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.linksTitleId}
          className={styles.TribeWelcomeDisplay__section}
        >
          <h2
            className={styles.TribeWelcomeDisplay__sectionTitle}
            id={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.linksTitleId}
          >
            {welcome.linksHeading}
          </h2>
          {welcome.selectionModalBenefit ? (
            <p className={styles.TribeWelcomeDisplay__benefit}>
              <span className={styles.TribeWelcomeDisplay__benefitEyebrow}>
                {TRIBE_WELCOME_DISPLAY_COPY.benefitEyebrow}
              </span>
              {welcome.selectionModalBenefit}
            </p>
          ) : null}
          <ul className={styles.TribeWelcomeDisplay__linkList}>
            {activeLinks.map((link) => {
              const href = getLinkHref(link);

              return href ? (
                <li
                  className={styles.TribeWelcomeDisplay__linkItem}
                  key={link.id}
                >
                  {renderLinkCard(link, href)}
                </li>
              ) : null;
            })}
          </ul>
        </section>
      ) : null}

      {action ? (
        <div className={styles.TribeWelcomeDisplay__action}>{action}</div>
      ) : null}
    </section>
  );
}
