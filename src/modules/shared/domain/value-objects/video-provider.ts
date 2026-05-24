export const VIDEO_PROVIDER = {
  loom: "loom",
  vimeo: "vimeo",
  wistia: "wistia",
  youtube: "youtube",
} as const;

export type VideoProvider = (typeof VIDEO_PROVIDER)[keyof typeof VIDEO_PROVIDER];
