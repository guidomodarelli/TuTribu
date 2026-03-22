import { createListCoursesUseCase } from "@/src/modules/courses/infrastructure/composition/create-list-courses-use-case";

describe("createListCoursesUseCase", () => {
  it("returns the course summaries expected by the UI", async () => {
    const useCase = createListCoursesUseCase();

    await expect(useCase.execute()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          title: expect.any(String),
          instructorName: expect.any(String),
          lessonCount: expect.any(Number),
          status: expect.any(String),
        }),
      ])
    );
  });
});
