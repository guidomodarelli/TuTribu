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
  defaultHeading: "Bienvenido/a",
  linksHeading: "Recursos para empezar",
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
  linksTitleId: "tribe-welcome-links-title",
  noreferrerRel: "noreferrer",
} as const;

type TribeWelcomeDisplayProps = {
  action?: React.ReactNode;
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

  const normalizedPhoneNumber = link.phoneNumber.replace(/\D/g, "");
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

export function TribeWelcomeDisplay({
  action,
  welcome,
}: TribeWelcomeDisplayProps) {
  const activeRules = getActiveRules(welcome.rules);
  const activeLinks = getActiveLinks(welcome.links);

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
            {TRIBE_WELCOME_DISPLAY_COPY.linksHeading}
          </h2>
          <ul className={styles.TribeWelcomeDisplay__linkList}>
            {activeLinks.map((link) => {
              const href = getLinkHref(link);

              return href ? (
                <li
                  className={styles.TribeWelcomeDisplay__linkItem}
                  key={link.id}
                >
                  <a
                    className={styles.TribeWelcomeDisplay__linkCard}
                    href={href}
                    rel={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.noreferrerRel}
                    target={TRIBE_WELCOME_DISPLAY_ATTRIBUTES.blankTarget}
                  >
                    <span className={styles.TribeWelcomeDisplay__linkCardTitle}>
                      {link.label}
                    </span>
                    {link.description ? (
                      <p className={styles.TribeWelcomeDisplay__linkCardDescription}>
                        {link.description}
                      </p>
                    ) : null}
                  </a>
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
