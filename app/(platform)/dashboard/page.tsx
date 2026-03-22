import { ArrowUpRight, CalendarClock, MessageSquareText, NotebookTabs } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { listCalendarEvents } from "@/src/features/calendar/repository";
import { listCommunityPosts } from "@/src/features/community/repository";
import { listCourses } from "@/src/features/courses/repository";

const dashboardSections = [
  {
    title: "Curriculum momentum",
    description: "Courses are modeled as reusable summaries to support catalog and cohort views.",
    icon: NotebookTabs,
  },
  {
    title: "Conversation pulse",
    description: "Community discussions already have author identity and engagement counts.",
    icon: MessageSquareText,
  },
  {
    title: "Events rhythm",
    description: "Calendar entries are shaped for upcoming sessions and operational planning.",
    icon: CalendarClock,
  },
] as const;

export default async function DashboardPage() {
  const [courses, posts, events] = await Promise.all([
    listCourses(),
    listCommunityPosts(),
    listCalendarEvents(),
  ]);

  const stats = [
    { label: "Courses", value: courses.length.toString().padStart(2, "0") },
    { label: "Posts", value: posts.length.toString().padStart(2, "0") },
    { label: "Events", value: events.length.toString().padStart(2, "0") },
  ];

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Dashboard placeholder
        </p>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            A stable control room for the next product phase.
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            This dashboard is intentionally lightweight. Its job is to prove the
            route structure, domain contracts, and reusable UI foundations.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/80 bg-card/85">
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-4xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/80 bg-card/88">
          <CardHeader>
            <CardTitle>Feature readiness</CardTitle>
            <CardDescription>
              Each area already exposes a read contract that can swap mocks for a real service later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboardSections.map(({ title, description, icon: Icon }, index) => (
              <div key={title}>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex size-10 items-center justify-center rounded-2xl bg-accent/60 text-accent-foreground">
                    <Icon className="size-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">{title}</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
                {index < dashboardSections.length - 1 ? (
                  <Separator className="my-4" />
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-secondary/75">
          <CardHeader>
            <CardTitle>Next likely step</CardTitle>
            <CardDescription>
              Connect the existing contracts to authentication and persistence.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              The codebase is already arranged so the UI does not need a major rewrite
              when replacing mock repositories with Supabase or another backend.
            </p>
            <div className="rounded-2xl bg-background/80 p-4 text-foreground">
              <p className="flex items-center gap-2 font-medium">
                Suggested direction
                <ArrowUpRight className="size-4" />
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Add auth and persistence behind the current repository signatures,
                then evolve the placeholder pages into member-ready flows.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
