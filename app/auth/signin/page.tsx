import { redirect } from "next/navigation";

import { SignInWithGoogleButton } from "../../../components/auth/sign-in-with-google-button";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";

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
  const callbackUrlForSignIn = resolveSafeCallbackUrl(rawCallbackUrl, "/dashboard");

  const useCase = createGetAuthenticatedMemberUseCase();
  const authenticatedMember = await useCase.execute();

  if (authenticatedMember) {
    redirect(callbackUrlForAuthenticatedMember);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-border/80 bg-card/90 p-8 shadow-[0_20px_60px_-44px_rgba(15,23,42,0.45)] backdrop-blur">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          AcademiaOnline login
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Continue with Google
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Sign in with your Google account to access your private platform.
        </p>
        <SignInWithGoogleButton callbackUrl={callbackUrlForSignIn} />
      </section>
    </main>
  );
}
