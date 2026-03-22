import { listCourses } from "@/src/features/courses/repository";

describe("listCourses", () => {
  it("returns the course summaries expected by the UI", async () => {
    await expect(listCourses()).resolves.toEqual(
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
