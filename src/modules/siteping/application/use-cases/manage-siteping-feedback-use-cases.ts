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
  screenshotDeletionUnconfirmed:
    "SitePing screenshot deletion was not confirmed; feedback kept for a later retry",
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

type AttachUploadedScreenshotInput = {
  feedback: SitepingFeedback;
  screenshotDataUrl: string | null | undefined;
  screenshotStorage: SitepingScreenshotStorage;
  sitepingFeedbackRepository: SitepingFeedbackRepository;
};

/**
 * Uploads the screenshot and links it to the already-created feedback row,
 * returning the feedback with its durable screenshot URL when the upload
 * succeeds, or the unchanged feedback otherwise.
 *
 * Running after the row exists is what keeps an orphan from outliving its
 * trigger: when the upload fails, {@link resolveScreenshotUrl} returns null (the
 * adapter reclaims its own reserved id), so the feedback simply keeps no
 * screenshot. When linking the uploaded URL does not persist — the attach throws,
 * or it matches no row because the feedback was deleted between create() and this
 * link — the image is reclaimed best-effort and the feedback keeps no screenshot,
 * because the bug report itself is durable and the screenshot is non-essential.
 * The only irreducible orphan window left is an upload that succeeds, this link
 * that fails to persist, AND that best-effort delete itself coming back
 * unconfirmed — far narrower than uploading before any row exists, which orphaned
 * on every failed insert.
 */
async function attachUploadedScreenshot({
  feedback,
  screenshotDataUrl,
  screenshotStorage,
  sitepingFeedbackRepository,
}: AttachUploadedScreenshotInput): Promise<SitepingFeedback> {
  const screenshotUrl = await resolveScreenshotUrl(
    screenshotStorage,
    screenshotDataUrl
  );

  if (!screenshotUrl) {
    return feedback;
  }

  let screenshotAttached: boolean;

  try {
    ({ screenshotAttached } = await sitepingFeedbackRepository.attachScreenshotUrl({
      feedbackId: feedback.id,
      screenshotUrl,
    }));
  } catch {
    // Linking the uploaded screenshot to the durable row threw, so the public
    // image would orphan with no row referencing it. Reclaim it best-effort and
    // drop the screenshot from this response; the feedback row and its GitHub
    // issue still ship. delete() never throws, so it cannot mask anything.
    await screenshotStorage.delete({ screenshotUrl });

    return feedback;
  }

  if (!screenshotAttached) {
    // The feedback row was deleted (or is no longer visible to this owner under
    // RLS) between create() and this link, so the UPDATE matched no row and
    // resolved without error. Treating the screenshot as attached would publish a
    // GitHub issue carrying a delivery URL that no row references, stranding a
    // public image with nothing to drive its cleanup. Reclaim it best-effort and
    // keep no screenshot.
    await screenshotStorage.delete({ screenshotUrl });

    return feedback;
  }

  return { ...feedback, screenshotUrl };
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
    // before creating a row or uploading, so a duplicate submission never pays
    // the upload latency nor leaves an orphan image in object storage.
    const existingFeedback =
      await sitepingFeedbackRepository.findByIdempotencyKey(idempotencyKey);

    if (existingFeedback) {
      return serializeSitepingFeedback(existingFeedback);
    }

    // Create the durable feedback row WITHOUT a screenshot first, then upload and
    // link the image only once the row exists. Uploading before the row would let
    // a failed insert (transient database error, RLS failure, or an annotation
    // insert failure) or a lost idempotency race strand a public image with no
    // row to drive its cleanup — and a best-effort delete that itself returns
    // screenshotCleared: false could never reclaim it. With this order, neither
    // failure has uploaded anything to orphan.
    const result = await sitepingFeedbackRepository.create({
      annotations: command.annotations.map(flattenAnnotation),
      authorEmail: normalizeEmail(authenticatedMember.email),
      authorName: normalizeText(authenticatedMember.name),
      clientId: idempotencyKey.clientId,
      createdBy: idempotencyKey.createdBy,
      diagnostics: sanitizeDiagnostics(command.diagnostics),
      message: redactSitepingSensitiveText(normalizeText(command.message)),
      projectName: idempotencyKey.projectName,
      screenshotUrl: null,
      type: command.type,
      url: redactSitepingSensitiveText(normalizeText(command.url)),
      urlPattern: normalizeOptionalText(command.urlPattern),
      userAgent: redactSitepingSensitiveText(normalizeText(command.userAgent)),
      viewport: normalizeText(command.viewport),
    });

    if (!result.wasCreated) {
      // A concurrent submission with the same idempotency key won the insert
      // race (ON CONFLICT DO NOTHING). This request uploaded nothing, so there is
      // no orphan to clean up and the surviving feedback keeps its own screenshot.
      return serializeSitepingFeedback(result.feedback);
    }

    // The row is durable now, so it is safe to upload the screenshot and link it.
    const feedback = await attachUploadedScreenshot({
      feedback: result.feedback,
      screenshotDataUrl: command.screenshotDataUrl,
      screenshotStorage,
      sitepingFeedbackRepository,
    });

    let publication: Awaited<ReturnType<GitHubIssuePublisher["publish"]>>;

    try {
      publication = await githubIssuePublisher.publish({
        feedback,
        requestUrl,
      });
    } catch (error) {
      await sitepingFeedbackRepository.markGitHubIssueFailed({
        errorMessage: readErrorMessage(error),
        feedbackId: feedback.id,
      });

      return serializeSitepingFeedback(feedback);
    }

    try {
      await sitepingFeedbackRepository.markGitHubIssuePublished({
        feedbackId: feedback.id,
        issueNumber: publication.issueNumber,
        issueUrl: publication.issueUrl,
      });
    } catch {
      // Keep the feedback pending because GitHub already created the issue.
    }

    return serializeSitepingFeedback(feedback);
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

    const { id: feedbackId, screenshotUrl } = feedback;

    // Delete the durable screenshot before removing the row so an interrupted
    // deletion stays retryable: while the row still exists, a later attempt
    // reloads it and re-runs the idempotent screenshot delete, avoiding an orphan
    // that a clear-last ordering would strand with no trigger to reclaim it. An
    // unconfirmed delete (storage unconfigured, an auth/4xx/5xx response, or a
    // timeout) throws so the caller can surface the failure and keep the row — the
    // only record of the delivery URL — in a status the admin/widget flow can
    // still reach to retry, instead of orphaning the image.
    async function clearScreenshotOrThrow(): Promise<void> {
      if (!screenshotUrl) {
        return;
      }

      const { screenshotCleared } = await screenshotStorage.delete({
        screenshotUrl,
      });

      if (!screenshotCleared) {
        throw new Error(
          `${SITEPING_ERROR_MESSAGE.screenshotDeletionUnconfirmed} (feedbackId=${feedbackId})`
        );
      }
    }

    if (
      feedback.githubIssueStatus ===
      SITEPING_FEEDBACK_GITHUB_STATUS.deletionCompleted
    ) {
      await clearScreenshotOrThrow();
      await sitepingFeedbackRepository.remove(command);

      return;
    }

    if (feedback.githubIssueNumber) {
      // Clear the durable screenshot BEFORE touching the GitHub issue, while the
      // row is still in its original, listable status. Closing the issue is
      // irreversible from this flow (the publisher exposes no reopen), so an
      // unconfirmed clear must never run after the close: that would leave the
      // issue closed forever while the catch restores the row to a visible,
      // retryable status, permanently desyncing the panel from its tracked issue
      // whenever storage stays unfixable. Clearing first means an unconfirmed
      // clear throws with the row untouched and the issue still open, so the
      // admin/widget flow can retry. delete() is idempotent (a 404 counts as
      // cleared), so re-clearing an already-deleted screenshot on a later retry —
      // for example after a close failure restored the row — is safe.
      await clearScreenshotOrThrow();

      if (
        feedback.githubIssueStatus !==
        SITEPING_FEEDBACK_GITHUB_STATUS.deletionPending
      ) {
        await sitepingFeedbackRepository.markGitHubIssueDeletionPending(command);
      }

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
    } else {
      // No linked GitHub issue, so there is no two-phase close to checkpoint.
      // Clear the screenshot while the row is still in its original, listable
      // status and never mark it deletion_pending, which findPage() would hide. An
      // unconfirmed clear then throws with the row untouched, so the normal
      // admin/widget flow can still reach it to retry the deletion.
      await clearScreenshotOrThrow();
    }

    await sitepingFeedbackRepository.remove(command);
  };
}
