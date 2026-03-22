import { ListCoursesUseCase } from "@/src/modules/courses/application/use-cases/list-courses-use-case";
import type { CourseRepository } from "@/src/modules/courses/domain/repositories/course-repository";

describe("ListCoursesUseCase", () => {
  it("returns course summaries from the repository port", async () => {
    const courseRepository: CourseRepository = {
      listCourses: jest.fn().mockResolvedValue([
        {
          id: "course-1",
          title: "Launch Lab",
          description: "Launch system",
          category: "Growth",
          instructorName: "Mara",
          lessonCount: 9,
          status: "Open",
        },
      ]),
    };

    const useCase = new ListCoursesUseCase(courseRepository);

    const result = await useCase.execute();

    expect(courseRepository.listCourses).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: "course-1",
        title: "Launch Lab",
        description: "Launch system",
        category: "Growth",
        instructorName: "Mara",
        lessonCount: 9,
        status: "Open",
      },
    ]);
  });
});
