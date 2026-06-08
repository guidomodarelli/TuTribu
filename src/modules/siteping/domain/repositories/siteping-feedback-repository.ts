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
  screenshotUrl: string | null;
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

export type SitepingFeedbackIdempotencyCommand = {
  clientId: string;
  createdBy: string;
  projectName: string;
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

export type AttachSitepingScreenshotCommand = {
  feedbackId: string;
  screenshotUrl: string;
};

export type AttachSitepingScreenshotResult = {
  screenshotAttached: boolean;
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
  /**
   * Links a just-uploaded durable screenshot URL to an already-created feedback
   * row. Kept separate from {@link SitepingFeedbackRepository.create} so the
   * screenshot is uploaded only after the row exists: a failed insert or a lost
   * idempotency race can then never strand a public image with no row to drive
   * its cleanup.
   *
   * @returns Whether the UPDATE matched a row. A concurrent delete between
   * `create()` and this link leaves no row to update, so the UPDATE resolves
   * without error yet persists nothing; the caller must reclaim the orphaned
   * image instead of treating the screenshot as attached.
   */
  attachScreenshotUrl(
    command: AttachSitepingScreenshotCommand
  ): Promise<AttachSitepingScreenshotResult>;
  create(
    command: CreateSitepingFeedbackRecordCommand
  ): Promise<CreateSitepingFeedbackRecordResult>;
  findByIdempotencyKey(
    command: SitepingFeedbackIdempotencyCommand
  ): Promise<SitepingFeedback | null>;
  findById(command: SitepingFeedbackProjectCommand): Promise<SitepingFeedback | null>;
  findPage(query: SitepingFeedbackQuery): Promise<SitepingFeedbackPage>;
  markGitHubIssueDeletionCompleted(
    command: MarkGitHubIssueDeletionCompletedCommand
  ): Promise<void>;
  markGitHubIssueDeletionPending(command: SitepingFeedbackProjectCommand): Promise<void>;
  markGitHubIssueFailed(command: MarkGitHubIssueFailedCommand): Promise<void>;
  markGitHubIssuePublished(command: MarkGitHubIssuePublishedCommand): Promise<void>;
  remove(command: SitepingFeedbackProjectCommand): Promise<void>;
  restoreGitHubIssuePublished(command: RestoreGitHubIssuePublishedCommand): Promise<void>;
  updateStatus(
    command: UpdateSitepingFeedbackStatusCommand
  ): Promise<SitepingFeedback | null>;
};
