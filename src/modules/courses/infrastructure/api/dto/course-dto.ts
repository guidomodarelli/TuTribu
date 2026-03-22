import type { CourseStatus } from "@/src/modules/courses/domain/entities/course";

export type CourseDto = {
  id: string;
  title: string;
  description: string;
  category: string;
  instructorName: string;
  lessonCount: number;
  status: CourseStatus;
};

export type CoursesResponseDto = {
  items: CourseDto[];
};

const courseStatuses: CourseStatus[] = ["Draft", "Open", "Scheduled"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCourseStatus(value: unknown): value is CourseStatus {
  return (
    typeof value === "string" &&
    courseStatuses.includes(value as CourseStatus)
  );
}

function isCourseDto(value: unknown): value is CourseDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.category === "string" &&
    typeof value.instructorName === "string" &&
    typeof value.lessonCount === "number" &&
    isCourseStatus(value.status)
  );
}

export function parseCoursesResponseDto(payload: unknown): CoursesResponseDto {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("Invalid courses payload");
  }

  if (!payload.items.every(isCourseDto)) {
    throw new Error("Invalid course item payload");
  }

  return {
    items: payload.items,
  };
}
