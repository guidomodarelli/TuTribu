import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CourseStatus } from "@/src/modules/courses/domain/entities/course";
import { createListCoursesUseCase } from "@/src/modules/courses/infrastructure/composition/create-list-courses-use-case";

const courseStatusLabelByStatus: Record<CourseStatus, string> = {
  Draft: "Borrador",
  Open: "Abierto",
  Scheduled: "Programado",
};

export default async function CoursesPage() {
  const listCoursesUseCase = createListCoursesUseCase();
  const courses = await listCoursesUseCase.execute();

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Cursos
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Los resumenes tipados de cursos ya estan disponibles para la interfaz.
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
              <p>Lecciones: {course.lessonCount}</p>
              <p>Estado: {courseStatusLabelByStatus[course.status]}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
