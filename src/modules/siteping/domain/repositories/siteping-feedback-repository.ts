import type {
  FeedbackStatus,
  FeedbackType,
} from "@siteping/widget";

import type { SITEPING_FEEDBACK_GITHUB_STATUS } from "@/src/modules/siteping/constants/siteping";
import type { SitepingDiagnosticsSnapshot } from "@/src/modules/siteping/domain/entities/siteping-diagnostics";

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
  status: FeedbackStatus;
  type: FeedbackType;
  updatedAt: Date;
  url: string;
  urlPattern: string | null;
  userAgent: string;
  viewport: string;
};

export type CreateSitepingFeedbackRecordCommand = {
  annotations: Omit<SitepingAnnotation, "createdAt" | "feedbackId" | "id">[];
  authorEmail: string;
  authorName: string;
  clientId: string;
  createdBy: string;
  diagnostics: SitepingDiagnosticsSnapshot | null;
  message: string;
  projectName: string;
  screenshotUrl: null;
  type: FeedbackType;
  url: string;
  urlPattern: string | null;
  userAgent: string;
  viewport: string;
};

export type CreateSitepingFeedbackRecordResult = {
  feedback: SitepingFeedback;
  wasCreated: boolean;
};

export type SitepingFeedbackQuery = {
  limit?: number;
  page?: number;
  projectName: string;
  search?: string;
  status?: FeedbackStatus;
  type?: FeedbackType;
  url?: string;
  urlPattern?: string;
};

export type SitepingFeedbackPage = {
  feedbacks: SitepingFeedback[];
  total: number;
};

export type UpdateSitepingFeedbackStatusCommand = {
  feedbackId: string;
  projectName: string;
  status: FeedbackStatus;
};

export type SitepingFeedbackProjectCommand = {
  feedbackId: string;
  projectName: string;
};

export type MarkGitHubIssuePublishedCommand = {
  feedbackId: string;
  issueNumber: number;
  issueUrl: string;
};

export type MarkGitHubIssueFailedCommand = {
  errorMessage: string;
  feedbackId: string;
};

export type SitepingFeedbackRepository = {
  create(
    command: CreateSitepingFeedbackRecordCommand
  ): Promise<CreateSitepingFeedbackRecordResult>;
  findById(command: SitepingFeedbackProjectCommand): Promise<SitepingFeedback | null>;
  findPage(query: SitepingFeedbackQuery): Promise<SitepingFeedbackPage>;
  markGitHubIssueFailed(command: MarkGitHubIssueFailedCommand): Promise<void>;
  markGitHubIssuePublished(command: MarkGitHubIssuePublishedCommand): Promise<void>;
  remove(command: SitepingFeedbackProjectCommand): Promise<void>;
  removeAll(projectName: string): Promise<void>;
  updateStatus(command: UpdateSitepingFeedbackStatusCommand): Promise<SitepingFeedback>;
};
