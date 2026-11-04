import { createHash } from "crypto";
import type { ReactNode } from "react";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ButtonLink } from "@/components/navigation/link";
import { Button } from "@golfo/ui";
import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import { buildLegacyAdmissionEntryRoute } from "@/lib/academy-admissions/admission-routes";
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
import { readFirstSearchParamValue } from "@/app/search-params";

const INVITATION_PAGE_COPY = {
  acceptButton: "Aceptar invitación",
  alreadySubscribedButton: "Ir a la tribu",
  alreadySubscribedDescription:
    "Tu suscripción está activa. Entrá a la tribu para continuar.",
  alreadySubscribedTitle: "Ya estás suscripto a esta tribu",
  blockedDescription:
    "Tu cuenta no puede acceder a esta tribu. Si creés que es un error, contactá a quien administra el espacio.",
  blockedTitle: "No pudimos sumar tu cuenta",
  confirmationDescription:
    "Confirmá que querés continuar con tu cuenta actual para revisar los requisitos de ingreso de esta tribu.",
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

const INVITATION_ACCEPTANCE_REVALIDATION = {
  path: "/",
  type: "layout",
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
  return buildSignInRedirectUrl(ROUTES.tribes.invitation(slug, token));
}

type InvitationPanelProps = {
  children?: ReactNode;
  description: string;
  title: string;
};

/** Invitation page layout: eyebrow, title, description and the step's content. */
function InvitationPanel({ children, description, title }: InvitationPanelProps) {
  return (
    <main className={styles.TribeInvitationPage}>
      <section className={styles.TribeInvitationPage__content}>
        <p className={styles.TribeInvitationPage__eyebrow}>
          {INVITATION_PAGE_COPY.eyebrow}
        </p>
        <h1 className={styles.TribeInvitationPage__title}>{title}</h1>
        <p className={styles.TribeInvitationPage__description}>{description}</p>
        {children}
      </section>
    </main>
  );
}

/** Form whose single submit button runs an invitation server action. */
function InvitationActionForm({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form action={action} className={styles.TribeInvitationPage__form}>
      <Button type={INVITATION_PAGE_FORM.submitButtonType}>{label}</Button>
    </form>
  );
}

function renderInvitationStatus(title: string, description: string) {
  return <InvitationPanel description={description} title={title} />;
}

function renderAlreadySubscribedStatus(slug: string) {
  return (
    <InvitationPanel
      description={INVITATION_PAGE_COPY.alreadySubscribedDescription}
      title={INVITATION_PAGE_COPY.alreadySubscribedTitle}
    >
      <ButtonLink href={ROUTES.tribes.bySlug(slug)}>
        {INVITATION_PAGE_COPY.alreadySubscribedButton}
      </ButtonLink>
    </InvitationPanel>
  );
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

function renderSubscriptionStartStatus(status: string, slug: string) {
  if (status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.alreadySubscribed) {
    return renderAlreadySubscribedStatus(slug);
  }

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

/**
 * Resolves the signed-in member of an invitation server action; without a
 * session (or member) it redirects to sign in and back to the invitation.
 */
async function requireInvitationMember(slug: string, token: string) {
  const session = await getSession();

  if (!session) {
    redirect(buildSignInRedirectPath(slug, token));
  }

  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    redirect(buildSignInRedirectPath(slug, token));
  }

  return { authenticatedMember, modules };
}

/** @param input - Existing route arrival, never a membership or policy permission. @returns Navigation to common admission for an academy with admission control, to the academy home for one without it, or the classic owner's confirmed outcome. */
export async function acceptInvitationAction({
  slug,
  token,
}: AcceptInvitationActionInput) {
  "use server";

  const { modules } = await requireInvitationMember(slug, token);

  const result = await modules.tribes.useCases.acceptTribeInvitation({
    token,
    tribeSlug: slug,
  });

  if (result.status === TRIBE_INVITATION_STATUS.admissionRequired) {
    redirect(buildLegacyAdmissionEntryRoute(slug, token));
  }

  // An academy without admission control keeps its basic entry on the academy home.
  if (result.status === TRIBE_INVITATION_STATUS.academyJoinAvailable) {
    redirect(ROUTES.tribes.academy(slug));
  }

  if (result.status === TRIBE_INVITATION_STATUS.accepted) {
    revalidatePath(
      INVITATION_ACCEPTANCE_REVALIDATION.path,
      INVITATION_ACCEPTANCE_REVALIDATION.type
    );
    redirect(ROUTES.tribes.welcome(slug));
  }

  redirect(buildInvitationStatusPath(slug, token, result.status));
}

export async function startInvitationSubscriptionAction({
  slug,
  token,
}: AcceptInvitationActionInput) {
  "use server";

  const { authenticatedMember, modules } = await requireInvitationMember(slug, token);

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

type InvitationPaymentProps = {
  canStartSubscription: boolean;
  startSubscription: () => Promise<void>;
  subscriptionOffer: Parameters<typeof renderSubscriptionOffer>[0];
};

/** Payment step of a paid invitation: the offer and, when available, the button that starts the subscription. */
function InvitationPayment({
  canStartSubscription,
  startSubscription,
  subscriptionOffer,
}: InvitationPaymentProps) {
  return (
    <InvitationPanel
      description={INVITATION_PAGE_COPY.paymentDescription}
      title={INVITATION_PAGE_COPY.paymentTitle}
    >
      {renderSubscriptionOffer(subscriptionOffer)}
      {canStartSubscription ? (
        <InvitationActionForm
          action={startSubscription}
          label={INVITATION_PAGE_COPY.paymentButton}
        />
      ) : null}
    </InvitationPanel>
  );
}

/** Last step of a free invitation: the button that joins the tribe. */
function InvitationConfirmation({ acceptInvitation: acceptInvitationWithToken }: { acceptInvitation: () => Promise<void> }) {
  return (
    <InvitationPanel
      description={INVITATION_PAGE_COPY.confirmationDescription}
      title={INVITATION_PAGE_COPY.confirmationTitle}
    >
      <InvitationActionForm
        action={acceptInvitationWithToken}
        label={INVITATION_PAGE_COPY.continueButton}
      />
    </InvitationPanel>
  );
}

/** Payment step reached from a "subscription required" status: the offer, startable only while it is available. */
async function renderSubscriptionRequired(
  modules: Awaited<ReturnType<typeof createRequestModules>>,
  { slug, token }: AcceptInvitationActionInput
) {
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
    <InvitationPayment
      canStartSubscription={canStartSubscription}
      startSubscription={startSubscription}
      subscriptionOffer={subscriptionOffer}
    />
  );
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
    ? renderSubscriptionStartStatus(status, slug)
    : null;

  if (subscriptionStartStatus) {
    return subscriptionStartStatus;
  }

  if (status === TRIBE_INVITATION_STATUS.subscriptionRequired) {
    return renderSubscriptionRequired(modules, { slug, token });
  }

  const subscriptionOffer =
    await modules.tribes.useCases.getTribeInvitationSubscriptionOffer({
      token,
      tribeSlug: slug,
    });

  if (
    subscriptionOffer.status ===
    TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS.available
  ) {
    const startSubscription = startInvitationSubscriptionAction.bind(null, {
      slug,
      token,
    });

    return (
      <InvitationPayment
        canStartSubscription
        startSubscription={startSubscription}
        subscriptionOffer={subscriptionOffer}
      />
    );
  }

  const acceptInvitationWithToken = acceptInvitationAction.bind(null, {
    slug,
    token,
  });

  return <InvitationConfirmation acceptInvitation={acceptInvitationWithToken} />;
}
