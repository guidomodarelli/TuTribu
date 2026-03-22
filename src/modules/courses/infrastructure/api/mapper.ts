import type { Course } from "@/src/modules/courses/domain/entities/course";

import type { CourseDto } from "./dto/course-dto";

export function mapCourseDtoToEntity(dto: CourseDto): Course {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    category: dto.category,
    instructorName: dto.instructorName,
    lessonCount: dto.lessonCount,
    status: dto.status,
  };
}
