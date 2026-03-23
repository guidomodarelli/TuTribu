import Link from "next/link";
import { redirect } from "next/navigation";

import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";

export default async function AuthErrorPage() {
  const useCase = createGetAuthenticatedMemberUseCase();
  const authenticatedMember = await useCase.execute();

  if (authenticatedMember) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-destructive/30 bg-card/90 p-8 shadow-[0_20px_60px_-44px_rgba(15,23,42,0.45)] backdrop-blur">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Authentication error
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          We could not complete Google sign-in
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Please try again. If the issue continues, contact support.
        </p>
        <Link
          href="/auth/signin"
          className="mt-6 inline-flex rounded-full border border-border/80 bg-secondary/80 px-5 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Back to sign-in
        </Link>
      </section>
    </main>
  );
}
