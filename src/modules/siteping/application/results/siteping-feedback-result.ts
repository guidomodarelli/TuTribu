import type { FeedbackResponse } from "@siteping/widget";

import type { SitepingDiagnosticsSnapshot } from "@/src/modules/siteping/domain/entities/siteping-diagnostics";

export type SitepingFeedbackResult = FeedbackResponse & {
  diagnostics: SitepingDiagnosticsSnapshot | null;
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
