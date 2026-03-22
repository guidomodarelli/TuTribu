import Link from "next/link";
import { ArrowRight, CalendarDays, GraduationCap, MessagesSquare } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { siteConfig } from "@/src/shared/config/site";

const featureCards = [
  {
    title: "Structured learning paths",
    description:
      "Build a modular curriculum with course overviews, progress entry points, and dedicated spaces for each cohort.",
    icon: GraduationCap,
  },
  {
    title: "Focused member conversations",
    description:
      "Keep discussions threaded around wins, blockers, and weekly goals without coupling the UI to a backend yet.",
    icon: MessagesSquare,
  },
  {
    title: "Events with clear cadence",
    description:
      "Reserve room for live sessions, office hours, and asynchronous follow-ups through a single calendar surface.",
    icon: CalendarDays,
  },
] as const;

const primaryLinkClassName =
  "inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90";

const secondaryLinkClassName =
  "inline-flex w-fit items-center rounded-lg border border-border/80 bg-background/80 px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-secondary";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 lg:px-10">
      <section className="rounded-[2rem] border border-border/80 bg-card/90 px-6 py-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur md:px-8">
        <div className="flex flex-col gap-10">
          <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl space-y-5">
              <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">
                Technical scaffold
              </p>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
                  {siteConfig.name} is ready to evolve into a focused online
                  community platform.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                  This first iteration prioritizes architecture, typed feature
                  modules, and a reliable testing baseline instead of shipping a
                  full product flow.
                </p>
              </div>
            </div>
            <div className="rounded-3xl border border-border/80 bg-secondary/70 p-5 md:max-w-xs">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Included from day one
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-secondary-foreground">
                <li>Next.js 16.2.0 with App Router and TypeScript</li>
                <li>Jest + Testing Library for unit coverage</li>
                <li>Playwright smoke tests for browser validation</li>
                <li>Mock-first domain contracts for future backend work</li>
              </ul>
            </div>
          </header>

          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <Link href="/dashboard" className={primaryLinkClassName}>
              Open dashboard scaffold
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/courses" className={secondaryLinkClassName}>
              Review feature placeholders
            </Link>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="feature-foundation"
        className="mt-10 grid gap-4 md:grid-cols-3"
      >
        <h2 id="feature-foundation" className="sr-only">
          Foundation modules
        </h2>
        {featureCards.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="border-border/80 bg-card/85 backdrop-blur">
            <CardHeader className="space-y-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/70 text-accent-foreground">
                <Icon className="size-5" />
              </div>
              <div className="space-y-2">
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/80 bg-card/88 backdrop-blur">
          <CardHeader>
            <CardTitle>What this scaffold already models</CardTitle>
            <CardDescription>
              The app surface is intentionally thin, but the domain layer is not.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
            <div className="rounded-2xl bg-secondary/80 p-4">
              <p className="font-medium text-secondary-foreground">
                Courses module
              </p>
              <p className="mt-2 leading-6">
                Typed summaries and a repository contract to support catalogs,
                cohorts, and lesson metadata.
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/80 p-4">
              <p className="font-medium text-secondary-foreground">
                Community module
              </p>
              <p className="mt-2 leading-6">
                Member-facing posts are represented independently from the UI,
                ready for a future API or realtime layer.
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/80 p-4">
              <p className="font-medium text-secondary-foreground">
                Calendar module
              </p>
              <p className="mt-2 leading-6">
                Event summaries are already shaped for upcoming sessions, office
                hours, and launches.
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/80 p-4">
              <p className="font-medium text-secondary-foreground">
                Shared foundations
              </p>
              <p className="mt-2 leading-6">
                Reusable UI, consistent paths, and test coverage around
                contracts and smoke navigation.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(234,245,246,0.75))]">
          <CardHeader>
            <CardTitle>Waitlist placeholder</CardTitle>
            <CardDescription>
              A non-functional form to reserve the marketing space that will come
              later in the product roadmap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" aria-label="Waitlist placeholder">
              <label className="block space-y-2 text-sm font-medium">
                Email address
                <Input
                  type="email"
                  placeholder="community@academiaonline.dev"
                  aria-describedby="waitlist-help"
                />
              </label>
              <p id="waitlist-help" className="text-sm leading-6 text-muted-foreground">
                This form stays intentionally disconnected. The first release is
                about structure and confidence, not lead capture yet.
              </p>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
