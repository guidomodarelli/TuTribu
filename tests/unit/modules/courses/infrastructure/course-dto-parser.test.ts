import { parseCoursesResponseDto } from "@/src/modules/courses/infrastructure/api/dto/course-dto";

describe("parseCoursesResponseDto", () => {
  it("throws when payload does not include items array", () => {
    expect(() => parseCoursesResponseDto({})).toThrow("Invalid courses payload");
  });

  it("throws when any item has invalid status", () => {
    expect(() =>
      parseCoursesResponseDto({
        items: [
          {
            id: "course-1",
            title: "Launch Lab",
            description: "Launch workflows",
            category: "Growth",
            instructorName: "Mara",
            lessonCount: 9,
            status: "InProgress",
          },
        ],
      })
    ).toThrow("Invalid course item payload");
  });
});
