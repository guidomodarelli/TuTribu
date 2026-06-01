import type {
  SITEPING_FEEDBACK_GITHUB_STATUS,
  SITEPING_FEEDBACK_STATUS,
  SITEPING_FEEDBACK_TYPE,
} from "@/src/modules/siteping/constants/siteping";
import type { SitepingDiagnosticsSnapshot } from "@/src/modules/siteping/domain/entities/siteping-diagnostics";

export type SitepingFeedbackType =
  (typeof SITEPING_FEEDBACK_TYPE)[keyof typeof SITEPING_FEEDBACK_TYPE];

export type SitepingFeedbackStatus =
  (typeof SITEPING_FEEDBACK_STATUS)[keyof typeof SITEPING_FEEDBACK_STATUS];

export type SitepingGitHubStatus =
  (typeof SITEPING_FEEDBACK_GITHUB_STATUS)[keyof typeof SITEPING_FEEDBACK_GITHUB_STATUS];

export type SitepingAnnotation = {
  anchorKey: string | null;
  createdAt: Date;
  cssSelector: string;
  devicePixelRatio: number;
  elementId: string | null;
  elementTag: string;
  feedbackId: string;
  fingerprint: string;
  hPct: number;
  id: string;
  neighborText: string;
  scrollX: number;
  scrollY: number;
  textPrefix: string;
  textSnippet: string;
  textSuffix: string;
  viewportH: number;
  viewportW: number;
  wPct: number;
  xpath: string;
  xPct: number;
  yPct: number;
};

export type SitepingFeedback = {
  annotations: SitepingAnnotation[];
  authorEmail: string;
  authorName: string;
  clientId: string;
  createdAt: Date;
  createdBy: string;
  diagnostics: SitepingDiagnosticsSnapshot | null;
  githubIssueNumber?: number | null;
  githubIssueStatus: SitepingGitHubStatus;
  githubIssueUrl?: string | null;
  id: string;
  message: string;
  projectName: string;
  resolvedAt: Date | null;
  screenshotUrl: string | null;
  status: SitepingFeedbackStatus;
  type: SitepingFeedbackType;
  updatedAt: Date;
  url: string;
  urlPattern: string | null;
  userAgent: string;
  viewport: string;
};
