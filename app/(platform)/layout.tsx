import Link from "next/link";

import { siteConfig } from "@/src/shared/config/site";

export default function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6 lg:px-10">
      <header className="rounded-[1.75rem] border border-border/80 bg-card/90 px-6 py-5 shadow-[0_20px_60px_-44px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Private platform scaffold
            </p>
            <div>
              <Link href="/" className="text-2xl font-semibold tracking-tight">
                {siteConfig.name}
              </Link>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Navigation and feature placeholders are wired to typed mock
                repositories so the UI can evolve without binding to a backend
                prematurely.
              </p>
            </div>
          </div>
          <nav aria-label="Platform navigation" className="flex flex-wrap gap-2">
            {siteConfig.platformNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-border/80 bg-secondary/80 px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 py-8">{children}</main>
    </div>
  );
}
