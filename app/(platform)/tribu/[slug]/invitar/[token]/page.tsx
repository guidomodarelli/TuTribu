import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { createRequestModules } from "@/src/modules/setup";
import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import styles from "./page.module.scss";

const INVITATION_PAGE_COPY = {
  acceptButton: "Aceptar invitación",
  blockedDescription:
    "Tu cuenta no puede acceder a esta tribu. Si creés que es un error, contactá a quien administra el espacio.",
  blockedTitle: "No pudimos sumar tu cuenta",
  confirmationDescription:
    "Confirmá que querés entrar con tu cuenta actual. Después vas a poder acceder al espacio de la tribu.",
  confirmationTitle: "Sumarte a esta tribu",
  eyebrow: "Invitación a una tribu",
  invalidDescription:
    "El link no existe o ya no está disponible. Pedí una invitación nueva para continuar.",
  invalidTitle: "Esta invitación no está disponible",
} as const;

const INVITATION_PAGE_ROUTE = {
  querySeparator: "?",
  statusParam: "status",
  valueSeparator: "=",
} as const;

const INVITATION_PAGE_FORM = {
  submitButtonType: "submit",
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

export async function acceptInvitationAction({
  slug,
  token,
}: AcceptInvitationActionInput) {
  "use server";

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
  const { slug, token } = await params;
  const resolvedSearchParams = await searchParams;
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

  const acceptInvitationWithToken = acceptInvitationAction.bind(null, {
    slug,
    token,
  });

  return (
    <main className={styles.TribeInvitationPage}>
      <section className={styles.TribeInvitationPage__content}>
        <p className={styles.TribeInvitationPage__eyebrow}>
          {INVITATION_PAGE_COPY.eyebrow}
        </p>
        <h1 className={styles.TribeInvitationPage__title}>
          {INVITATION_PAGE_COPY.confirmationTitle}
        </h1>
        <p className={styles.TribeInvitationPage__description}>
          {INVITATION_PAGE_COPY.confirmationDescription}
        </p>
        <form
          action={acceptInvitationWithToken}
          className={styles.TribeInvitationPage__form}
        >
          <Button type={INVITATION_PAGE_FORM.submitButtonType}>
            {INVITATION_PAGE_COPY.acceptButton}
          </Button>
        </form>
      </section>
    </main>
  );
}
