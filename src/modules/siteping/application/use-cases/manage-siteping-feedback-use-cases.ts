import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type {
  SitepingAnnotationCommand,
  SitepingFeedbackCommand,
} from "@/src/modules/siteping/application/commands/siteping-feedback-command";
import {
  SITEPING_FEEDBACK_GITHUB_STATUS,
  SITEPING_PROJECT,
} from "@/src/modules/siteping/constants/siteping";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { isPrivilegedTribeMemberRole } from "@/src/modules/tribes/constants/tribe-member-role";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import type { GitHubIssuePublisher } from "@/src/modules/siteping/domain/repositories/github-issue-publisher";
import type { SitepingScreenshotStorage } from "@/src/modules/siteping/domain/repositories/siteping-screenshot-storage";
import type {
  SitepingAnnotation,
  SitepingFeedback,
  SitepingFeedbackProjectCommand,
  SitepingFeedbackQuery,
  SitepingFeedbackRepository,
  UpdateSitepingFeedbackStatusCommand,
} from "@/src/modules/siteping/domain/repositories/siteping-feedback-repository";
import type {
  SitepingFeedbackListResult,
  SitepingFeedbackResult,
  SitepingIdentityResult,
} from "@/src/modules/siteping/application/results/siteping-feedback-result";
import type {
  SitepingConsoleDiagnosticEntry,
  SitepingDiagnosticsSnapshot,
  SitepingNetworkDiagnosticEntry,
} from "@/src/modules/siteping/domain/entities/siteping-diagnostics";
import { redactSitepingSensitiveText } from "@/src/modules/siteping/domain/services/siteping-sensitive-text-redaction";

const SITEPING_ERROR_MESSAGE = {
  unknownGitHubFailure: "Unknown GitHub issue publication failure",
} as const;

const SAFE_HTTP_METHODS = new Set([
  "CONNECT",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
]);

const SAFE_DIAGNOSTIC_FALLBACK = "[redacted]";

type CreateSitepingFeedbackDependencies = {
  githubIssuePublisher: GitHubIssuePublisher;
  screenshotStorage: SitepingScreenshotStorage;
  sitepingFeedbackRepository: SitepingFeedbackRepository;
};

type CreateSitepingFeedbackInput = {
  authenticatedMember: AuthenticatedMemberResult;
  command: SitepingFeedbackCommand;
  requestUrl: string;
};

type GetSitepingIdentityDependencies = {
  allowedEmails: string[];
  enabled: boolean;
  projectName?: string;
};

type GetSitepingIdentityInput = {
  authenticatedMember: AuthenticatedMemberResult | null;
  memberTribes: MemberTribeListItemResult[];
};

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim() ?? "";

  return normalizedValue || null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeConsoleDiagnosticEntry(
  entry: SitepingConsoleDiagnosticEntry
): SitepingConsoleDiagnosticEntry {
  return {
    level: entry.level,
    message: redactSitepingSensitiveText(entry.message),
    timestamp: entry.timestamp,
  };
}

function sanitizeNetworkDiagnosticMethod(method: string): string {
  const normalizedMethod = method.trim().toUpperCase();

  return SAFE_HTTP_METHODS.has(normalizedMethod)
    ? normalizedMethod
    : SAFE_DIAGNOSTIC_FALLBACK;
}

function sanitizeNetworkDiagnosticEntry(
  entry: SitepingNetworkDiagnosticEntry
): SitepingNetworkDiagnosticEntry {
  return {
    durationMs: entry.durationMs,
    method: sanitizeNetworkDiagnosticMethod(entry.method),
    status: entry.status,
    timestamp: entry.timestamp,
    url: redactSitepingSensitiveText(entry.url),
  };
}

function sanitizeDiagnostics(
  diagnostics: SitepingDiagnosticsSnapshot | null | undefined
): SitepingDiagnosticsSnapshot | null {
  if (!diagnostics) {
    return null;
  }

  return {
    console: diagnostics.console.map(sanitizeConsoleDiagnosticEntry),
    network: diagnostics.network.map(sanitizeNetworkDiagnosticEntry),
  };
}

function serializeDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeAnnotation(annotation: SitepingAnnotation) {
  return {
    ...annotation,
    createdAt: serializeDate(annotation.createdAt),
    neighborText: redactSitepingSensitiveText(annotation.neighborText),
    textPrefix: redactSitepingSensitiveText(annotation.textPrefix),
    textSnippet: redactSitepingSensitiveText(annotation.textSnippet),
    textSuffix: redactSitepingSensitiveText(annotation.textSuffix),
  };
}

export function serializeSitepingFeedback(
  feedback: SitepingFeedback
): SitepingFeedbackResult {
  return {
    annotations: feedback.annotations.map(serializeAnnotation),
    authorEmail: feedback.authorEmail,
    authorName: feedback.authorName,
    createdAt: serializeDate(feedback.createdAt),
    diagnostics: feedback.diagnostics,
    id: feedback.id,
    message: feedback.message,
    projectName: feedback.projectName,
    resolvedAt: feedback.resolvedAt ? serializeDate(feedback.resolvedAt) : null,
    screenshotUrl: feedback.screenshotUrl,
    status: feedback.status,
    type: feedback.type,
    updatedAt: serializeDate(feedback.updatedAt),
    url: feedback.url,
    urlPattern: feedback.urlPattern,
    userAgent: feedback.userAgent,
    viewport: feedback.viewport,
  };
}

function flattenAnnotation(annotation: SitepingAnnotationCommand) {
  return {
    anchorKey: annotation.anchor.anchorKey ?? null,
    cssSelector: annotation.anchor.cssSelector,
    devicePixelRatio: annotation.devicePixelRatio,
    elementId: annotation.anchor.elementId ?? null,
    elementTag: annotation.anchor.elementTag,
    fingerprint: annotation.anchor.fingerprint,
    hPct: annotation.rect.hPct,
    neighborText: redactSitepingSensitiveText(annotation.anchor.neighborText),
    scrollX: annotation.scrollX,
    scrollY: annotation.scrollY,
    textPrefix: redactSitepingSensitiveText(annotation.anchor.textPrefix),
    textSnippet: redactSitepingSensitiveText(annotation.anchor.textSnippet),
    textSuffix: redactSitepingSensitiveText(annotation.anchor.textSuffix),
    viewportH: annotation.viewportH,
    viewportW: annotation.viewportW,
    wPct: annotation.rect.wPct,
    xpath: annotation.anchor.xpath,
    xPct: annotation.rect.xPct,
    yPct: annotation.rect.yPct,
  };
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : SITEPING_ERROR_MESSAGE.unknownGitHubFailure;
}

export function getSitepingIdentity({
  allowedEmails,
  enabled,
  projectName = SITEPING_PROJECT.defaultName,
}: GetSitepingIdentityDependencies) {
  const allowedEmailSet = new Set(allowedEmails.map(normalizeEmail));

  return ({
    authenticatedMember,
    memberTribes,
  }: GetSitepingIdentityInput): SitepingIdentityResult => {
    const hasAllowedEmail = authenticatedMember
      ? allowedEmailSet.has(normalizeEmail(authenticatedMember.email))
      : false;
    const hasPrivilegedMembership = memberTribes.some(
      (memberTribe) =>
        memberTribe.membershipStatus === TRIBE_MEMBERSHIP_STATUS.active &&
        isPrivilegedTribeMemberRole(memberTribe.role)
    );
    const canSendFeedback = hasAllowedEmail || hasPrivilegedMembership;

    if (!enabled || !authenticatedMember || !canSendFeedback) {
      return {
        enabled: false,
        identity: null,
        projectName,
      };
    }

    return {
      enabled: true,
      identity: {
        email: authenticatedMember.email,
        name: authenticatedMember.name,
      },
      projectName,
    };
  };
}

async function resolveScreenshotUrl(
  screenshotStorage: SitepingScreenshotStorage,
  screenshotDataUrl: string | null | undefined
): Promise<string | null> {
  if (!screenshotDataUrl) {
    return null;
  }

  // Persist only the durable object-storage URL. When storage is unconfigured
  // or the upload fails, drop the screenshot (persist null) instead of inlining
  // the multi-MB data URL: GET /api/siteping serializes screenshotUrl for every
  // feedback in a page, so an inline payload would bloat list responses.
  return screenshotStorage.store({ dataUrl: screenshotDataUrl });
}

export function createSitepingFeedback({
  githubIssuePublisher,
  screenshotStorage,
  sitepingFeedbackRepository,
}: CreateSitepingFeedbackDependencies) {
  return async ({
    authenticatedMember,
    command,
    requestUrl,
  }: CreateSitepingFeedbackInput): Promise<SitepingFeedbackResult> => {
    const idempotencyKey = {
      clientId: normalizeText(command.clientId),
      createdBy: authenticatedMember.id,
      projectName: normalizeText(command.projectName),
    };

    // Short-circuit idempotent retries (for example after a client timeout)
    // before uploading the screenshot, so a duplicate submission never pays the
    // upload latency nor leaves an orphan image in object storage.
    const existingFeedback =
      await sitepingFeedbackRepository.findByIdempotencyKey(idempotencyKey);

    if (existingFeedback) {
      return serializeSitepingFeedback(existingFeedback);
    }

    const screenshotUrl = await resolveScreenshotUrl(
      screenshotStorage,
      command.screenshotDataUrl
    );
    const result = await sitepingFeedbackRepository.create({
      annotations: command.annotations.map(flattenAnnotation),
      authorEmail: normalizeEmail(authenticatedMember.email),
      authorName: normalizeText(authenticatedMember.name),
      clientId: idempotencyKey.clientId,
      createdBy: idempotencyKey.createdBy,
      diagnostics: sanitizeDiagnostics(command.diagnostics),
      message: redactSitepingSensitiveText(normalizeText(command.message)),
      projectName: idempotencyKey.projectName,
      screenshotUrl,
      type: command.type,
      url: redactSitepingSensitiveText(normalizeText(command.url)),
      urlPattern: normalizeOptionalText(command.urlPattern),
      userAgent: redactSitepingSensitiveText(normalizeText(command.userAgent)),
      viewport: normalizeText(command.viewport),
    });

    if (!result.wasCreated) {
      return serializeSitepingFeedback(result.feedback);
    }

    let publication: Awaited<ReturnType<GitHubIssuePublisher["publish"]>>;

    try {
      publication = await githubIssuePublisher.publish({
        feedback: result.feedback,
        requestUrl,
      });
    } catch (error) {
      await sitepingFeedbackRepository.markGitHubIssueFailed({
        errorMessage: readErrorMessage(error),
        feedbackId: result.feedback.id,
      });

      return serializeSitepingFeedback(result.feedback);
    }

    try {
      await sitepingFeedbackRepository.markGitHubIssuePublished({
        feedbackId: result.feedback.id,
        issueNumber: publication.issueNumber,
        issueUrl: publication.issueUrl,
      });
    } catch {
      // Keep the feedback pending because GitHub already created the issue.
    }

    return serializeSitepingFeedback(result.feedback);
  };
}

export function listSitepingFeedback({
  sitepingFeedbackRepository,
}: {
  sitepingFeedbackRepository: SitepingFeedbackRepository;
}) {
  return async (
    query: SitepingFeedbackQuery
  ): Promise<SitepingFeedbackListResult> => {
    const page = await sitepingFeedbackRepository.findPage(query);

    return {
      feedbacks: page.feedbacks.map(serializeSitepingFeedback),
      total: page.total,
    };
  };
}

export function updateSitepingFeedbackStatus({
  sitepingFeedbackRepository,
}: {
  sitepingFeedbackRepository: SitepingFeedbackRepository;
}) {
  return async (
    command: UpdateSitepingFeedbackStatusCommand
  ): Promise<SitepingFeedbackResult | null> => {
    const feedback = await sitepingFeedbackRepository.updateStatus(command);

    if (!feedback) {
      return null;
    }

    return serializeSitepingFeedback(feedback);
  };
}

export function deleteSitepingFeedback({
  githubIssuePublisher,
  screenshotStorage,
  sitepingFeedbackRepository,
}: {
  githubIssuePublisher: GitHubIssuePublisher;
  screenshotStorage: SitepingScreenshotStorage;
  sitepingFeedbackRepository: SitepingFeedbackRepository;
}) {
  return async (command: SitepingFeedbackProjectCommand): Promise<void> => {
    const feedback = await sitepingFeedbackRepository.findById(command);

    if (!feedback) {
      return;
    }

    const { screenshotUrl } = feedback;

    // Delete the durable screenshot before removing the record so an interrupted
    // deletion is retryable: while the row still exists, a later attempt reloads
    // it and re-runs the idempotent screenshot delete, avoiding an orphan that a
    // remove-first ordering would strand with no trigger to reclaim it.
    async function removeFeedbackAndScreenshot(): Promise<void> {
      if (screenshotUrl) {
        await screenshotStorage.delete({ screenshotUrl });
      }

      await sitepingFeedbackRepository.remove(command);
    }

    if (
      feedback.githubIssueStatus ===
      SITEPING_FEEDBACK_GITHUB_STATUS.deletionCompleted
    ) {
      await removeFeedbackAndScreenshot();

      return;
    }

    if (
      feedback.githubIssueStatus !== SITEPING_FEEDBACK_GITHUB_STATUS.deletionPending
    ) {
      await sitepingFeedbackRepository.markGitHubIssueDeletionPending(command);
    }

    if (feedback.githubIssueNumber) {
      try {
        await githubIssuePublisher.close({
          feedbackId: feedback.id,
          issueNumber: feedback.githubIssueNumber,
        });
      } catch (error) {
        await sitepingFeedbackRepository.restoreGitHubIssuePublished({
          feedbackId: feedback.id,
        });

        throw error;
      }

      await sitepingFeedbackRepository.markGitHubIssueDeletionCompleted({
        feedbackId: feedback.id,
      });
    }

    await removeFeedbackAndScreenshot();
  };
}
