import {
  recordLastViewedLesson,
  setLessonCompletion,
} from "@/src/modules/courses/application/use-cases/lesson-progress-use-cases";

function buildRepository() {
  return {
    recordLastViewedLesson: jest.fn(async () => ({
      status: "recorded" as const,
    })),
    setLessonCompletion: jest.fn(async () => ({
      status: "completed" as const,
    })),
  };
}

describe("lesson progress use cases", () => {
  it("marks a lesson as completed with trimmed identifiers", async () => {
    const repository = buildRepository();
    const useCase = setLessonCompletion({ courseRepository: repository });

    const result = await useCase({
      completed: true,
      lessonId: " l1 ",
      tribeSlug: " matematica-pro ",
    });

    expect(result).toEqual({ status: "completed" });
    expect(repository.setLessonCompletion).toHaveBeenCalledWith({
      completed: true,
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects completion toggles without a lesson id", async () => {
    const repository = buildRepository();
    const useCase = setLessonCompletion({ courseRepository: repository });

    const result = await useCase({
      completed: false,
      lessonId: "   ",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "not_found" });
    expect(repository.setLessonCompletion).not.toHaveBeenCalled();
  });

  it("records the last viewed lesson with trimmed identifiers", async () => {
    const repository = buildRepository();
    const useCase = recordLastViewedLesson({ courseRepository: repository });

    const result = await useCase({
      courseId: " c1 ",
      lessonId: " l1 ",
      tribeSlug: " matematica-pro ",
    });

    expect(result).toEqual({ status: "recorded" });
    expect(repository.recordLastViewedLesson).toHaveBeenCalledWith({
      courseId: "c1",
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });
  });

  it("rejects recording without a course id", async () => {
    const repository = buildRepository();
    const useCase = recordLastViewedLesson({ courseRepository: repository });

    const result = await useCase({
      courseId: "  ",
      lessonId: "l1",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ status: "not_found" });
    expect(repository.recordLastViewedLesson).not.toHaveBeenCalled();
  });
});
