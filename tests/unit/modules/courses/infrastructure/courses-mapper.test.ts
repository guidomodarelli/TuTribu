import { mapCourseDtoToEntity } from "@/src/modules/courses/infrastructure/api/mapper";

describe("mapCourseDtoToEntity", () => {
  it("maps course DTO payload into domain entity", () => {
    const result = mapCourseDtoToEntity({
      id: "course-1",
      title: "Launch Lab",
      description: "Launch workflows",
      category: "Growth",
      instructorName: "Mara",
      lessonCount: 9,
      status: "Open",
    });

    expect(result).toEqual({
      id: "course-1",
      title: "Launch Lab",
      description: "Launch workflows",
      category: "Growth",
      instructorName: "Mara",
      lessonCount: 9,
      status: "Open",
    });
  });
});
