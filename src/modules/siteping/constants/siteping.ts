export const SITEPING_PROJECT = {
  defaultName: "tutribu",
} as const;

export const SITEPING_FEEDBACK_TYPE = {
  bug: "bug",
  change: "change",
  other: "other",
  question: "question",
} as const;

export const SITEPING_FEEDBACK_STATUS = {
  open: "open",
  resolved: "resolved",
} as const;

export const SITEPING_FEEDBACK_GITHUB_STATUS = {
  failed: "failed",
  pending: "pending",
  published: "published",
  skipped: "skipped",
} as const;

export const SITEPING_API_ENDPOINT = "/api/siteping";
export const SITEPING_IDENTITY_ENDPOINT = "/api/siteping/identity";

