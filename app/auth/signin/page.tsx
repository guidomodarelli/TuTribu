import { redirect } from "next/navigation";

import { SignInWithGoogleButton } from "../../../components/auth/sign-in-with-google-button";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";
import styles from "./page.module.scss";

type SignInSearchParams = {
  [key: string]: string | string[] | undefined;
};

function resolveSafeCallbackUrl(rawCallbackUrl: string | null, fallbackPath: string): string {
  if (!rawCallbackUrl) {
    return fallbackPath;
  }

  const trimmedCallbackUrl = rawCallbackUrl.trim();

  if (!trimmedCallbackUrl.startsWith("/") || trimmedCallbackUrl.startsWith("//")) {
    return fallbackPath;
  }

  return trimmedCallbackUrl;
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

export default async function SignInPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<SignInSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawCallbackUrl = readFirstSearchParamValue(resolvedSearchParams.callbackUrl);
  const callbackUrlForAuthenticatedMember = resolveSafeCallbackUrl(rawCallbackUrl, "/");
  const callbackUrlForSignIn = resolveSafeCallbackUrl(rawCallbackUrl, "/");

  const useCase = createGetAuthenticatedMemberUseCase();
  const authenticatedMember = await useCase.execute();

  if (authenticatedMember) {
    redirect(callbackUrlForAuthenticatedMember);
  }

  return (
    <main className={styles.SignInPage}>
      <section className={styles.SignInPage__card}>
        <div
          aria-hidden="true"
          className={styles.SignInPage__highlight}
        />
        <p className={styles.SignInPage__eyebrow}>
          Acceso a AcademiaOnline
        </p>
        <h1 className={styles.SignInPage__title}>
          Continuar con Google
        </h1>
        <p className={styles.SignInPage__description}>
          Inicia sesion con tu cuenta de Google para acceder a tu plataforma privada.
        </p>
        <SignInWithGoogleButton callbackUrl={callbackUrlForSignIn} />
      </section>
    </main>
  );
}
