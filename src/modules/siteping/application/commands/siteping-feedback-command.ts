import type {
  AnnotationPayload,
  FeedbackType,
} from "@siteping/widget";

import type { SitepingDiagnosticsSnapshot } from "@/src/modules/siteping/domain/entities/siteping-diagnostics";

export type SitepingFeedbackCommand = {
  annotations: AnnotationPayload[];
  authorEmail: string;
  authorName: string;
  clientId: string;
  diagnostics?: SitepingDiagnosticsSnapshot | null;
  message: string;
  projectName: string;
  screenshotDataUrl?: string | null;
  type: FeedbackType;
  url: string;
  urlPattern?: string | null;
  userAgent: string;
  viewport: string;
};
