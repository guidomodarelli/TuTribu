import type { SitepingDiagnosticsSnapshot } from "@/src/modules/siteping/domain/entities/siteping-diagnostics";
import type {
  SitepingAnnotation,
  SitepingFeedbackStatus,
  SitepingFeedbackType,
} from "@/src/modules/siteping/domain/entities/siteping-feedback";

export type SitepingAnnotationResult = Omit<
  SitepingAnnotation,
  "createdAt" | "feedbackId"
> & {
  createdAt: string;
};

export type SitepingFeedbackResult = {
  annotations: SitepingAnnotationResult[];
  authorEmail: string;
  authorName: string;
  createdAt: string;
  diagnostics: SitepingDiagnosticsSnapshot | null;
  id: string;
  message: string;
  projectName: string;
  resolvedAt: string | null;
  screenshotUrl: string | null;
  status: SitepingFeedbackStatus;
  type: SitepingFeedbackType;
  updatedAt: string;
  url: string;
  urlPattern: string | null;
  userAgent: string;
  viewport: string;
};

export type SitepingFeedbackListResult = {
  feedbacks: SitepingFeedbackResult[];
  total: number;
};

export type SitepingIdentityResult = {
  enabled: boolean;
  identity: {
    email: string;
    name: string;
  } | null;
  projectName: string;
};
