/**
 * Course access requirement value object.
 *
 * @module course-access-requirement
 */

import {
  COURSE_ACCESS_REQUIREMENT,
  type CourseAccessRequirement,
} from "@/src/modules/courses/constants/courses";

/**
 * Normalizes a persisted or submitted requirement. Unknown values fall back to
 * `membership`, the historical behavior, so a malformed row never widens or
 * narrows access by accident (the SQL CHECK only admits the two values).
 *
 * @param value - Raw requirement.
 * @returns A valid course access requirement.
 */
export function normalizeCourseAccessRequirement(
  value: string | null | undefined
): CourseAccessRequirement {
  return value === COURSE_ACCESS_REQUIREMENT.academy
    ? COURSE_ACCESS_REQUIREMENT.academy
    : COURSE_ACCESS_REQUIREMENT.membership;
}

/**
 * Parses a requirement submitted by a leader. Returns null for invalid input
 * so the use case can reject it instead of silently defaulting.
 *
 * @param value - Submitted value.
 * @returns The requirement or null.
 */
export function parseCourseAccessRequirement(
  value: unknown
): CourseAccessRequirement | null {
  return value === COURSE_ACCESS_REQUIREMENT.academy ||
    value === COURSE_ACCESS_REQUIREMENT.membership
    ? value
    : null;
}
