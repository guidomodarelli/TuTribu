import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listCourses } from "@/src/features/courses/repository";

export default async function CoursesPage() {
  const courses = await listCourses();

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Courses
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Typed course summaries are already available to the UI.
        </h1>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <Card key={course.id} className="border-border/80 bg-card/88">
            <CardHeader>
              <CardDescription>{course.category}</CardDescription>
              <CardTitle>{course.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p>{course.description}</p>
              <p>Instructor: {course.instructorName}</p>
              <p>Lessons: {course.lessonCount}</p>
              <p>Status: {course.status}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
