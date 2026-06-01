import type { SitepingDiagnosticsSnapshot } from "@/src/modules/siteping/domain/entities/siteping-diagnostics";
import type { SitepingFeedbackType } from "@/src/modules/siteping/domain/entities/siteping-feedback";

export type SitepingAnnotationCommand = {
  anchor: {
    anchorKey?: string | null;
    cssSelector: string;
    elementId?: string | null;
    elementTag: string;
    fingerprint: string;
    neighborText: string;
    textPrefix: string;
    textSnippet: string;
    textSuffix: string;
    xpath: string;
  };
  devicePixelRatio: number;
  rect: {
    hPct: number;
    wPct: number;
    xPct: number;
    yPct: number;
  };
  scrollX: number;
  scrollY: number;
  viewportH: number;
  viewportW: number;
};

export type SitepingFeedbackCommand = {
  annotations: SitepingAnnotationCommand[];
  authorEmail: string;
  authorName: string;
  clientId: string;
  diagnostics?: SitepingDiagnosticsSnapshot | null;
  message: string;
  projectName: string;
  screenshotDataUrl?: string | null;
  type: SitepingFeedbackType;
  url: string;
  urlPattern?: string | null;
  userAgent: string;
  viewport: string;
};
