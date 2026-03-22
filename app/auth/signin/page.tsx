import Link from "next/link";

export default function SignInPage() {
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
        <Link
          href="/api/auth/signin/google?callbackUrl=%2Fdashboard"
          className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-border/80 bg-secondary/80 px-5 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Sign in with Google
        </Link>
      </section>
    </main>
  );
}
