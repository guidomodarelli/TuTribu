import { HttpCourseRepository } from "@/src/modules/courses/infrastructure/repositories/http-course-repository";

describe("HttpCourseRepository", () => {
  it("requests courses from backend and maps DTOs", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "course-1",
            title: "Launch Lab",
            description: "Launch workflows",
            category: "Growth",
            instructorName: "Mara",
            lessonCount: 9,
            status: "Open",
          },
        ],
      }),
    });

    const repository = new HttpCourseRepository(
      "https://api.academia.test",
      fetcher
    );

    const result = await repository.listCourses();

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.academia.test/v1/courses",
      expect.objectContaining({
        method: "GET",
      })
    );
    expect(result).toEqual([
      {
        id: "course-1",
        title: "Launch Lab",
        description: "Launch workflows",
        category: "Growth",
        instructorName: "Mara",
        lessonCount: 9,
        status: "Open",
      },
    ]);
  });
});
