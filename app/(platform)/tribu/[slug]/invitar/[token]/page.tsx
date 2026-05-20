import { createHash } from "crypto";

import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { TribeWelcomeDisplay } from "@/components/tribes/tribe-welcome-display";
import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { createRequestModules } from "@/src/modules/setup";
import { getServerBetterAuthSession as getSession } from "@/src/modules/auth/infrastructure/better-auth/server-auth-context";
import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import type { TribeInvitationSubscriptionOfferResult } from "@/src/modules/tribes/application/results/tribe-invitation-result";
import {
  TRIBE_INVITATION_STATUS,
  TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS,
} from "@/src/modules/tribes/constants/tribe-invitations";
import styles from "./page.module.scss";

const INVITATION_PAGE_COPY = {
  acceptButton: "Aceptar invitación",
  blockedDescription:
    "Tu cuenta no puede acceder a esta tribu. Si creés que es un error, contactá a quien administra el espacio.",
  blockedTitle: "No pudimos sumar tu cuenta",
  confirmationDescription:
    "Confirmá que querés entrar con tu cuenta actual. Después vas a poder acceder al espacio de la tribu.",
  confirmationTitle: "Sumarte a esta tribu",
  continueButton: "Comenzar",
  eyebrow: "Invitación a una tribu",
  invalidDescription:
    "El link no existe o ya no está disponible. Pedí una invitación nueva para continuar.",
  invalidTitle: "Esta invitación no está disponible",
  paymentButton: "Continuar con el pago",
  paymentDescription:
    "Esta tribu tiene una suscripción activa. Para entrar, continuá con el precio actual.",
  paymentOfferAmountLabel: "Precio mensual",
  paymentOfferAvailabilityLabel: "Estado",
  paymentOfferAvailable: "disponible",
  paymentOfferUnavailable: "no disponible",
  paymentUnavailableDescription:
    "No pudimos iniciar el pago en este momento. Intentá de nuevo más tarde o pedí ayuda a quien administra la tribu.",
  paymentUnavailableTitle: "No pudimos iniciar el pago",
  paymentTitle: "Completá tu suscripción",
} as const;

const INVITATION_PAGE_ROUTE = {
  querySeparator: "?",
  statusParam: "status",
  valueSeparator: "=",
} as const;

const INVITATION_PAGE_FORM = {
  submitButtonType: "submit",
} as const;

const INVITATION_SUBSCRIPTION = {
  amountDivisor: 100,
  checkoutUrlProperty: "checkoutUrl",
  hashAlgorithm: "sha256",
  hashEncoding: "hex",
  idempotencySeparator: ":",
} as const;

const INVITATION_SUBSCRIPTION_AMOUNT_FORMAT = {
  currencyStyle: "currency",
  locale: "es-AR",
} as const;

type TribeInvitationPageSearchParams = {
  status?: string | string[];
};

type AcceptInvitationActionInput = {
  slug: string;
  token: string;
};

function buildSignInRedirectPath(slug: string, token: string): string {
  const callbackUrl = ROUTES.tribes.invitation(slug, token);

  return (
    ROUTES.auth.signIn +
    INVITATION_PAGE_ROUTE.querySeparator +
    QUERY_PARAMS.auth.callbackUrl +
    INVITATION_PAGE_ROUTE.valueSeparator +
    callbackUrl
  );
}

function renderInvitationStatus(title: string, description: string) {
  return (
    <main className={styles.TribeInvitationPage}>
      <section className={styles.TribeInvitationPage__content}>
        <p className={styles.TribeInvitationPage__eyebrow}>
          {INVITATION_PAGE_COPY.eyebrow}
        </p>
        <h1 className={styles.TribeInvitationPage__title}>{title}</h1>
        <p className={styles.TribeInvitationPage__description}>{description}</p>
      </section>
    </main>
  );
}

function readFirstSearchParamValue(
  searchParamValue: string | string[] | undefined
): string | null {
  if (typeof searchParamValue === "string") {
    return searchParamValue;
  }

  if (Array.isArray(searchParamValue)) {
    const firstStringValue = searchParamValue.find((value) => value.trim().length > 0);

    return firstStringValue ?? null;
  }

  return null;
}

function buildInvitationStatusPath(
  slug: string,
  token: string,
  status: string
): string {
  return (
    ROUTES.tribes.invitation(slug, token) +
    INVITATION_PAGE_ROUTE.querySeparator +
    INVITATION_PAGE_ROUTE.statusParam +
    INVITATION_PAGE_ROUTE.valueSeparator +
    status
  );
}

function buildInvitationSubscriptionIdempotencyKey(input: {
  memberId: string;
  slug: string;
  token: string;
}): string {
  const tokenHash = createHash(INVITATION_SUBSCRIPTION.hashAlgorithm)
    .update(input.token)
    .digest(INVITATION_SUBSCRIPTION.hashEncoding);

  return [
    input.memberId,
    input.slug,
    tokenHash,
  ].join(INVITATION_SUBSCRIPTION.idempotencySeparator);
}

function renderSubscriptionStartStatus(status: string) {
  if (status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked) {
    return renderInvitationStatus(
      INVITATION_PAGE_COPY.blockedTitle,
      INVITATION_PAGE_COPY.blockedDescription
    );
  }

  if (status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.invalidInvitation) {
    return renderInvitationStatus(
      INVITATION_PAGE_COPY.invalidTitle,
      INVITATION_PAGE_COPY.invalidDescription
    );
  }

  if (
    status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.missingCurrentPrice ||
    status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked
  ) {
    return renderInvitationStatus(
      INVITATION_PAGE_COPY.paymentUnavailableTitle,
      INVITATION_PAGE_COPY.paymentUnavailableDescription
    );
  }

  return null;
}

function formatInvitationSubscriptionAmount(
  amountCents: number,
  currency: string
): string {
  return new Intl.NumberFormat(INVITATION_SUBSCRIPTION_AMOUNT_FORMAT.locale, {
    currency,
    style: INVITATION_SUBSCRIPTION_AMOUNT_FORMAT.currencyStyle,
  }).format(amountCents / INVITATION_SUBSCRIPTION.amountDivisor);
}

function renderSubscriptionOffer(
  offer: TribeInvitationSubscriptionOfferResult
) {
  if (
    offer.status !== TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS.available
  ) {
    return (
      <div className={styles.TribeInvitationPage__offer}>
        <p className={styles.TribeInvitationPage__offerStatus}>
          {INVITATION_PAGE_COPY.paymentOfferAvailabilityLabel}:{" "}
          {INVITATION_PAGE_COPY.paymentOfferUnavailable}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.TribeInvitationPage__offer}>
      <p className={styles.TribeInvitationPage__offerName}>
        {offer.price.name}
      </p>
      <dl className={styles.TribeInvitationPage__offerDetails}>
        <div className={styles.TribeInvitationPage__offerDetail}>
          <dt className={styles.TribeInvitationPage__offerTerm}>
            {INVITATION_PAGE_COPY.paymentOfferAmountLabel}
          </dt>
          <dd className={styles.TribeInvitationPage__offerValue}>
            {formatInvitationSubscriptionAmount(
              offer.price.amountCents,
              offer.price.currency
            )}
          </dd>
        </div>
      </dl>
      <p className={styles.TribeInvitationPage__offerStatus}>
        {INVITATION_PAGE_COPY.paymentOfferAvailabilityLabel}:{" "}
        {INVITATION_PAGE_COPY.paymentOfferAvailable}
      </p>
    </div>
  );
}

export async function acceptInvitationAction({
  slug,
  token,
}: AcceptInvitationActionInput) {
  "use server";

  const session = await getSession();

  if (!session) {
    redirect(buildSignInRedirectPath(slug, token));
  }

  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    redirect(buildSignInRedirectPath(slug, token));
  }

  const result = await modules.tribes.useCases.acceptTribeInvitation({
    token,
    tribeSlug: slug,
  });

  if (result.status === TRIBE_INVITATION_STATUS.accepted) {
    redirect(ROUTES.tribes.bySlug(slug));
  }

  redirect(buildInvitationStatusPath(slug, token, result.status));
}

export async function startInvitationSubscriptionAction({
  slug,
  token,
}: AcceptInvitationActionInput) {
  "use server";

  const session = await getSession();

  if (!session) {
    redirect(ROUTES.auth.signIn);
  }

  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    redirect(ROUTES.auth.signIn);
  }

  const idempotencyKey = buildInvitationSubscriptionIdempotencyKey({
    memberId: authenticatedMember.id,
    slug,
    token,
  });
  const result = await modules.subscriptions.useCases
    .startTribeMemberSubscription({
      idempotencyKey,
      invitationToken: token,
      tribeSlug: slug,
    })
    .catch(() => ({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked,
    }));

  if (INVITATION_SUBSCRIPTION.checkoutUrlProperty in result) {
    redirect(result.checkoutUrl);
  }

  redirect(buildInvitationStatusPath(slug, token, result.status));
}

export default async function TribeInvitationPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{
    slug: string;
    token: string;
  }>;
  searchParams?: Promise<TribeInvitationPageSearchParams>;
}) {
  const [{ slug, token }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const status = readFirstSearchParamValue(
    resolvedSearchParams[INVITATION_PAGE_ROUTE.statusParam]
  );
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    redirect(buildSignInRedirectPath(slug, token));
  }

  if (status === TRIBE_INVITATION_STATUS.blocked) {
    return renderInvitationStatus(
      INVITATION_PAGE_COPY.blockedTitle,
      INVITATION_PAGE_COPY.blockedDescription
    );
  }

  if (
    status === TRIBE_INVITATION_STATUS.invalid ||
    status === TRIBE_INVITATION_STATUS.revoked
  ) {
    return renderInvitationStatus(
      INVITATION_PAGE_COPY.invalidTitle,
      INVITATION_PAGE_COPY.invalidDescription
    );
  }

  const subscriptionStartStatus = status
    ? renderSubscriptionStartStatus(status)
    : null;

  if (subscriptionStartStatus) {
    return subscriptionStartStatus;
  }

  if (status === TRIBE_INVITATION_STATUS.subscriptionRequired) {
    const startSubscription = startInvitationSubscriptionAction.bind(null, {
      slug,
      token,
    });
    const subscriptionOffer =
      await modules.tribes.useCases.getTribeInvitationSubscriptionOffer({
        token,
        tribeSlug: slug,
      });
    const canStartSubscription =
      subscriptionOffer.status ===
      TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS.available;

    return (
      <main className={styles.TribeInvitationPage}>
        <section className={styles.TribeInvitationPage__content}>
          <p className={styles.TribeInvitationPage__eyebrow}>
            {INVITATION_PAGE_COPY.eyebrow}
          </p>
          <h1 className={styles.TribeInvitationPage__title}>
            {INVITATION_PAGE_COPY.paymentTitle}
          </h1>
          <p className={styles.TribeInvitationPage__description}>
            {INVITATION_PAGE_COPY.paymentDescription}
          </p>
          {renderSubscriptionOffer(subscriptionOffer)}
          {canStartSubscription ? (
            <form
              action={startSubscription}
              className={styles.TribeInvitationPage__form}
            >
              <Button type={INVITATION_PAGE_FORM.submitButtonType}>
                {INVITATION_PAGE_COPY.paymentButton}
              </Button>
            </form>
          ) : null}
        </section>
      </main>
    );
  }

  const acceptInvitationWithToken = acceptInvitationAction.bind(null, {
    slug,
    token,
  });

  const welcome = await modules.tribes.useCases.getTribeWelcomeByInvitation({
    token,
    tribeSlug: slug,
  });

  return (
    <main className={styles.TribeInvitationPage}>
      <TribeWelcomeDisplay
        welcome={welcome}
        action={
          <form
            action={acceptInvitationWithToken}
            className={styles.TribeInvitationPage__form}
          >
            <Button type={INVITATION_PAGE_FORM.submitButtonType}>
              {INVITATION_PAGE_COPY.continueButton}
            </Button>
          </form>
        }
      />
    </main>
  );
}
