import { Link } from "@/components/navigation/link";
import { Button } from "beez-ui";

import styles from "./styles.module.scss";

const TRIBE_OPEN_JOIN_COPY = {
  amountLabel: "Precio mensual",
  description:
    "Esta tribu tiene una suscripción activa. Para entrar, continuá con el precio actual.",
  eyebrow: "Unite a esta tribu",
  submitButton: "Continuar con el pago",
  title: "Completá tu suscripción",
} as const;

const TRIBE_OPEN_JOIN_AMOUNT_FORMAT = {
  currencyStyle: "currency",
  locale: "es-AR",
} as const;

const TRIBE_OPEN_JOIN_AMOUNT_DIVISOR = 100;
const TRIBE_OPEN_JOIN_SUBMIT_BUTTON_TYPE = "submit";

type TribeOpenJoinOffer = {
  amountCents: number;
  currency: string;
  name: string;
};

type TribeOpenJoinProps = {
  offer: TribeOpenJoinOffer;
  startAction: () => Promise<void>;
};

type TribeOpenJoinStatusProps = {
  cta?: {
    href: string;
    label: string;
  };
  description: string;
  title: string;
};

/**
 * Formats an integer amount in cents into a localized currency string.
 *
 * @param amountCents - Integer amount in cents.
 * @param currency - ISO currency code for the amount.
 * @returns Localized currency string for the offer.
 */
function formatTribeOpenJoinAmount(
  amountCents: number,
  currency: string
): string {
  return new Intl.NumberFormat(TRIBE_OPEN_JOIN_AMOUNT_FORMAT.locale, {
    currency,
    style: TRIBE_OPEN_JOIN_AMOUNT_FORMAT.currencyStyle,
  }).format(amountCents / TRIBE_OPEN_JOIN_AMOUNT_DIVISOR);
}

/**
 * Renders the public-join subscription offer with a checkout submit action.
 *
 * Shown on the bare tribe link to a non-member when the tribe exposes a paid
 * price flagged as current. Submitting starts the tokenless checkout flow.
 *
 * @param props - Current paid offer and the bound server action.
 * @returns Public join offer section.
 */
export function TribeOpenJoin({ offer, startAction }: TribeOpenJoinProps) {
  return (
    <section className={styles.TribeOpenJoin}>
      <p className={styles.TribeOpenJoin__eyebrow}>
        {TRIBE_OPEN_JOIN_COPY.eyebrow}
      </p>
      <h1 className={styles.TribeOpenJoin__title}>
        {TRIBE_OPEN_JOIN_COPY.title}
      </h1>
      <p className={styles.TribeOpenJoin__description}>
        {TRIBE_OPEN_JOIN_COPY.description}
      </p>
      <div className={styles.TribeOpenJoin__offer}>
        <p className={styles.TribeOpenJoin__offerName}>{offer.name}</p>
        <dl className={styles.TribeOpenJoin__offerDetails}>
          <div className={styles.TribeOpenJoin__offerDetail}>
            <dt className={styles.TribeOpenJoin__offerTerm}>
              {TRIBE_OPEN_JOIN_COPY.amountLabel}
            </dt>
            <dd className={styles.TribeOpenJoin__offerValue}>
              {formatTribeOpenJoinAmount(offer.amountCents, offer.currency)}
            </dd>
          </div>
        </dl>
      </div>
      <form action={startAction} className={styles.TribeOpenJoin__form}>
        <Button type={TRIBE_OPEN_JOIN_SUBMIT_BUTTON_TYPE}>
          {TRIBE_OPEN_JOIN_COPY.submitButton}
        </Button>
      </form>
    </section>
  );
}

/**
 * Renders a public-join status message with an optional call to action.
 *
 * Used for terminal outcomes of the tokenless join flow, such as a checkout
 * that could not start or an already active subscription.
 *
 * @param props - Status copy and optional call-to-action link.
 * @returns Public join status section.
 */
export function TribeOpenJoinStatus({
  cta,
  description,
  title,
}: TribeOpenJoinStatusProps) {
  return (
    <section className={styles.TribeOpenJoin}>
      <p className={styles.TribeOpenJoin__eyebrow}>
        {TRIBE_OPEN_JOIN_COPY.eyebrow}
      </p>
      <h1 className={styles.TribeOpenJoin__title}>{title}</h1>
      <p className={styles.TribeOpenJoin__description}>{description}</p>
      {cta ? (
        <div className={styles.TribeOpenJoin__form}>
          <Button asChild>
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}
