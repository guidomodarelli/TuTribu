export const COURSE_MUTATION_STATUS = {
  created: "created",
  deleted: "deleted",
  forbidden: "forbidden",
  invalidInput: "invalid_input",
  invalidVideoUrl: "invalid_video_url",
  notFound: "not_found",
  updated: "updated",
} as const;

export type CourseMutationStatus =
  (typeof COURSE_MUTATION_STATUS)[keyof typeof COURSE_MUTATION_STATUS];
