import type { CourseAccessRequirement } from "@/src/modules/courses/constants/courses";

export type Course = {
  /**
   * `membership` courses are read with a valid membership; `academy` courses
   * need academy access while the tribe runs in academy mode.
   */
  accessRequirement: CourseAccessRequirement;
  coverImageUrl: string | null;
  description: string | null;
  id: string;
  isActive: boolean;
  sortOrder: number;
  title: string;
};
