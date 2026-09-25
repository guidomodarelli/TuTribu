import { z } from "zod";

import {
  COURSE_LESSON_DESCRIPTION,
  COURSE_LESSON_TITLE,
} from "@/src/modules/courses/constants/courses";
import { TRIBE_SLUG_PATTERN } from "@/src/modules/tribes/domain/value-objects/tribe-slug";

/**
 * Input contracts of the "Convertir en lección" routes:
 * `GET /api/tribes/[slug]/courses/lesson-targets` and
 * `POST /api/tribes/[slug]/courses/lessons/from-event`. Validated once per
 * request at the route boundary; the video never comes from the client (the
 * route reads the recording from the events module).
 */

/**
 * Stable issue categories mapped to Spanish copy by the route.
 */
export const LESSON_EVENT_SOURCE_INPUT_ISSUE = {
  invalidLesson: "invalid_lesson",
  invalidReference: "invalid_reference",
} as const;

export const lessonEventSourceParamsSchema = z.object({
  slug: z
    .string({ error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidReference })
    .regex(TRIBE_SLUG_PATTERN, { error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidReference }),
});

const uuidSchema = z.guid({ error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidReference });

/**
 * Body of `POST .../lessons/from-event`: where the lesson goes, which
 * occurrence recording it comes from, and the (prefilled, editable) copy.
 */
export const lessonFromEventBodySchema = z.object(
  {
    courseId: uuidSchema,
    courseModuleId: uuidSchema,
    description: z
      .string({ error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidLesson })
      .trim()
      .max(COURSE_LESSON_DESCRIPTION.maxLength, {
        error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidLesson,
      })
      .nullish()
      .transform((description) => description || null),
    eventId: uuidSchema,
    occurrenceStartsAt: z
      .string({ error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidReference })
      .pipe(z.iso.datetime({ error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidReference, offset: true }))
      .transform((instant) => new Date(instant).toISOString()),
    title: z
      .string({ error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidLesson })
      .trim()
      .min(1, { error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidLesson })
      .max(COURSE_LESSON_TITLE.maxLength, { error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidLesson }),
  },
  { error: LESSON_EVENT_SOURCE_INPUT_ISSUE.invalidLesson }
);

export type LessonFromEventRequestBody = z.input<typeof lessonFromEventBodySchema>;
