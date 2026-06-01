import type { SitepingDiagnosticsSnapshot } from "@/src/modules/siteping/domain/entities/siteping-diagnostics";
import type {
  SitepingAnnotation,
  SitepingFeedback,
  SitepingFeedbackStatus,
  SitepingFeedbackType,
} from "@/src/modules/siteping/domain/entities/siteping-feedback";

export type { SitepingAnnotation, SitepingFeedback };

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
  type: SitepingFeedbackType;
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
  status?: SitepingFeedbackStatus;
  type?: SitepingFeedbackType;
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
  status: SitepingFeedbackStatus;
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

export type MarkGitHubIssueDeletionCompletedCommand = {
  feedbackId: string;
};

export type RestoreGitHubIssuePublishedCommand = {
  feedbackId: string;
};

export type SitepingFeedbackRepository = {
  create(
    command: CreateSitepingFeedbackRecordCommand
  ): Promise<CreateSitepingFeedbackRecordResult>;
  findById(command: SitepingFeedbackProjectCommand): Promise<SitepingFeedback | null>;
  findPage(query: SitepingFeedbackQuery): Promise<SitepingFeedbackPage>;
  markGitHubIssueDeletionCompleted(
    command: MarkGitHubIssueDeletionCompletedCommand
  ): Promise<void>;
  markGitHubIssueDeletionPending(command: SitepingFeedbackProjectCommand): Promise<void>;
  markGitHubIssueFailed(command: MarkGitHubIssueFailedCommand): Promise<void>;
  markGitHubIssuePublished(command: MarkGitHubIssuePublishedCommand): Promise<void>;
  remove(command: SitepingFeedbackProjectCommand): Promise<void>;
  removeAll(projectName: string): Promise<void>;
  restoreGitHubIssuePublished(command: RestoreGitHubIssuePublishedCommand): Promise<void>;
  updateStatus(command: UpdateSitepingFeedbackStatusCommand): Promise<SitepingFeedback>;
};
