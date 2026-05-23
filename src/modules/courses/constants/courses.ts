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

export const VIDEO_PROVIDER = {
  loom: "loom",
  vimeo: "vimeo",
  wistia: "wistia",
  youtube: "youtube",
} as const;

export type VideoProvider = (typeof VIDEO_PROVIDER)[keyof typeof VIDEO_PROVIDER];
