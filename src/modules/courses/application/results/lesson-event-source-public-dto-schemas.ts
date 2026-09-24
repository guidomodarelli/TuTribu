import { z } from "zod";

/**
 * Runtime contracts (allowlists) of the "Convertir en lección" DTOs: bodies of
 * `GET /api/tribes/[slug]/courses/lesson-targets` and
 * `POST /api/tribes/[slug]/courses/lessons/from-event`. The events UI parses
 * them with `safeParse` before using a response.
 */

/**
 * In-app path: one leading slash, never `//host` (protocol-relative URL).
 */
const INTERNAL_PATH_PATTERN = /^\/(?!\/)/;

const lessonTargetSchema = z.object({
  id: z.uuid(),
  modules: z.array(z.object({ id: z.uuid(), title: z.string() })),
  title: z.string(),
});

export const lessonConversionTargetsResponseSchema = z.object({
  courses: z.array(lessonTargetSchema),
});

/**
 * `isExisting` tells the UI the occurrence already had a lesson in that
 * course: the conversion links to it instead of duplicating.
 */
export const lessonConversionResponseSchema = z.object({
  isExisting: z.boolean(),
  lesson: z.object({
    courseId: z.uuid(),
    href: z.string().regex(INTERNAL_PATH_PATTERN),
    id: z.uuid(),
    title: z.string(),
  }),
  message: z.string(),
});

export const lessonConversionMessageResponseSchema = z.object({
  message: z.string(),
});

export type LessonConversionTargetsResponse = z.infer<typeof lessonConversionTargetsResponseSchema>;
export type LessonConversionResponse = z.infer<typeof lessonConversionResponseSchema>;
