"use client";

import { ArrowUpRightIcon, LoaderCircleIcon } from "lucide-react";

import type {
  TribeWelcomeLinkResult,
  TribeWelcomeResult,
  TribeWelcomeRuleResult,
} from "@/src/modules/tribes/application/results/tribe-welcome-result";
import { useTribeWelcomeLinkSelection } from "@/hooks/use-tribe-welcome-link-selection";
import { getTribeWelcomeLinkHref } from "@/lib/tribes/tribe-welcome-link-href";
import styles from "./styles.module.scss";

const TRIBE_WELCOME_DISPLAY_COPY = {
  agreementsHeading: "Acuerdos de convivencia",
  benefitEyebrow: "Beneficio por seleccionar una opción",
  defaultHeading: "Bienvenido/a",
  eyebrow: "Antes de empezar",
} as const;

const TRIBE_WELCOME_DISPLAY_ATTRIBUTES = {
  agreementsTitleId: "tribe-welcome-agreements-title",
  blankTarget: "_blank",
  buttonType: "button",
  linksTitleId: "tribe-welcome-links-title",
  noreferrerRel: "noreferrer",
} as const;

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

/**
 * Records the member selection of a welcome resource, one at a time, before
 * opening its destination in a pre-opened window.
 * @param tribeSlug - Tribe slug; without it nothing is recorded.
 * @returns The id of the link being recorded and the selection handler.
 */
function useWelcomeSelection(tribeSlug: string | undefined) {
  const { pendingLinkId, selectLink } = useTribeWelcomeLinkSelection();

  const handleSelect = async (
    link: TribeWelcomeLinkResult,
    href: string
  ): Promise<void> => {
    if (!tribeSlug) {
      return;
    }

    await selectLink({ href, link, tribeSlug });
  };

  return { handleSelect, pendingLinkId };
}

type TribeWelcomeLinkCardProps = {
  href: string;
  link: TribeWelcomeLinkResult;
  onSelect: (link: TribeWelcomeLinkResult, href: string) => void;
  pendingLinkId: string | null;
  tribeSlug?: string;
};

/**
 * Resource card: a plain external link in the leader preview, or a button
 * that records the member selection.
 * @param props - Link, its destination, the pending link and the select handler.
 * @returns The resource card.
 */
function TribeWelcomeLinkCard({
  href,
  link,
  onSelect,
  pendingLinkId,
  tribeSlug,
}: TribeWelcomeLinkCardProps) {
  const isPending = pendingLinkId === link.id;
  const TrailingIcon = isPending ? LoaderCircleIcon : ArrowUpRightIcon;
  // Only phrasing content: the card can render as a <button>, where block
  // elements such as <p> are invalid HTML.
  const content = (
    <>
      <span className={styles.TribeWelcomeDisplay__linkCardText}>
        <span className={styles.TribeWelcomeDisplay__linkCardTitle}>
          {link.label}
        </span>
        {link.description ? (
          <span className={styles.TribeWelcomeDisplay__linkCardDescription}>
            {link.description}
          </span>
        ) : null}
      </span>
      <TrailingIcon
        aria-hidden
        className={
          isPending
            ? `${styles.TribeWelcomeDisplay__linkCardIcon} ${styles["TribeWelcomeDisplay__linkCardIcon--pending"]}`
            : styles.TribeWelcomeDisplay__linkCardIcon
        }
      />
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
      aria-busy={isPending || undefined}
      className={styles.TribeWelcomeDisplay__linkCard}
      disabled={pendingLinkId !== null}
      onClick={() => {
        onSelect(link, href);
      }}
      type={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.buttonType}
    >
      {content}
    </button>
  );
}

/**
 * Ordered list of the active agreements.
 * @param props - Active rules to show.
 * @returns The agreements section.
 */
function TribeWelcomeRules({ rules }: { rules: TribeWelcomeRuleResult[] }) {
  return (
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
        {rules.map((rule) => (
          <li
            className={styles.TribeWelcomeDisplay__ruleItem}
            key={rule.id}
          >
            {rule.label}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Member-facing welcome screen: greeting, active agreements and the resource
 * links. With a `tribeSlug` each resource records the member selection before
 * opening its destination (pre-opened window keeps popup blockers happy);
 * without it the resources are plain external links, as in the leader preview.
 */
export function TribeWelcomeDisplay({
  action,
  tribeSlug,
  welcome,
}: TribeWelcomeDisplayProps) {
  const activeRules = getActiveRules(welcome.rules);
  const activeLinks = getActiveLinks(welcome.links);
  const { handleSelect, pendingLinkId } = useWelcomeSelection(tribeSlug);

  return (
    <section className={styles.TribeWelcomeDisplay}>
      <header className={styles.TribeWelcomeDisplay__header}>
        <p className={styles.TribeWelcomeDisplay__eyebrow}>
          {TRIBE_WELCOME_DISPLAY_COPY.eyebrow}
        </p>
        <h1 className={styles.TribeWelcomeDisplay__title}>
          {TRIBE_WELCOME_DISPLAY_COPY.defaultHeading}
        </h1>
        <p className={styles.TribeWelcomeDisplay__message}>
          {welcome.welcomeMessage}
        </p>
      </header>

      {activeRules.length > 0 ? (
        <TribeWelcomeRules rules={activeRules} />
      ) : null}

      {activeLinks.length > 0 ? (
        <section
          aria-labelledby={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.linksTitleId}
          className={styles.TribeWelcomeDisplay__section}
        >
          {welcome.selectionModalBenefit ? (
            <p className={styles.TribeWelcomeDisplay__benefit}>
              <span className={styles.TribeWelcomeDisplay__benefitEyebrow}>
                {TRIBE_WELCOME_DISPLAY_COPY.benefitEyebrow}
              </span>
              {welcome.selectionModalBenefit}
            </p>
          ) : null}
          <h2
            className={styles.TribeWelcomeDisplay__sectionTitle}
            id={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.linksTitleId}
          >
            {welcome.linksHeading}
          </h2>
          <ul className={styles.TribeWelcomeDisplay__linkList}>
            {activeLinks.map((link) => {
              const href = getTribeWelcomeLinkHref(link);

              return href ? (
                <li
                  className={styles.TribeWelcomeDisplay__linkItem}
                  key={link.id}
                >
                  <TribeWelcomeLinkCard
                    href={href}
                    link={link}
                    onSelect={(selectedLink, selectedHref) => {
                      void handleSelect(selectedLink, selectedHref);
                    }}
                    pendingLinkId={pendingLinkId}
                    tribeSlug={tribeSlug}
                  />
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
