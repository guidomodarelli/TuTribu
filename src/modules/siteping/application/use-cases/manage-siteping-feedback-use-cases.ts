import type {
  AnnotationPayload,
} from "@siteping/widget";

import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type { SitepingFeedbackCommand } from "@/src/modules/siteping/application/commands/siteping-feedback-command";
import { SITEPING_PROJECT } from "@/src/modules/siteping/constants/siteping";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { isPrivilegedTribeMemberRole } from "@/src/modules/tribes/constants/tribe-member-role";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import type { GitHubIssuePublisher } from "@/src/modules/siteping/domain/repositories/github-issue-publisher";
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

const SITEPING_ERROR_MESSAGE = {
  unknownGitHubFailure: "Unknown GitHub issue publication failure",
} as const;

const SITEPING_REDACTION = {
  hiddenValue: "[redacted]",
  sensitiveJsonKeyValuePattern:
    /("[^"]*(?:token|key|password|secret|code|state|session|auth|cookie)[^"]*"\s*:\s*)"[^"]*"/gi,
  sensitiveKeyValuePattern:
    /\b([a-z0-9_-]*(?:token|key|password|secret|code|state|session|auth|cookie)[a-z0-9_-]*)(=|:\s*)[^\s,;)&]+/gi,
  sensitiveQueryPattern:
    /([?&][^=&]*(?:token|key|password|secret|code|state|session|auth|cookie)[^=&]*=)[^&]+/gi,
  tokenLikePattern: /(bearer\s+)[a-z0-9._-]+/gi,
} as const;

type CreateSitepingFeedbackDependencies = {
  githubIssuePublisher: GitHubIssuePublisher;
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

function redactSensitiveText(value: string): string {
  return value
    .replace(
      SITEPING_REDACTION.sensitiveQueryPattern,
      `$1${SITEPING_REDACTION.hiddenValue}`
    )
    .replace(
      SITEPING_REDACTION.sensitiveJsonKeyValuePattern,
      `$1"${SITEPING_REDACTION.hiddenValue}"`
    )
    .replace(
      SITEPING_REDACTION.sensitiveKeyValuePattern,
      `$1$2${SITEPING_REDACTION.hiddenValue}`
    )
    .replace(
      SITEPING_REDACTION.tokenLikePattern,
      `$1${SITEPING_REDACTION.hiddenValue}`
    );
}

function sanitizeConsoleDiagnosticEntry(
  entry: SitepingConsoleDiagnosticEntry
): SitepingConsoleDiagnosticEntry {
  return {
    level: entry.level,
    message: redactSensitiveText(entry.message),
    timestamp: entry.timestamp,
  };
}

function sanitizeNetworkDiagnosticEntry(
  entry: SitepingNetworkDiagnosticEntry
): SitepingNetworkDiagnosticEntry {
  return {
    durationMs: entry.durationMs,
    method: entry.method,
    status: entry.status,
    timestamp: entry.timestamp,
    url: redactSensitiveText(entry.url),
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

function flattenAnnotation(annotation: AnnotationPayload) {
  return {
    anchorKey: annotation.anchor.anchorKey ?? null,
    cssSelector: annotation.anchor.cssSelector,
    devicePixelRatio: annotation.devicePixelRatio,
    elementId: annotation.anchor.elementId ?? null,
    elementTag: annotation.anchor.elementTag,
    fingerprint: annotation.anchor.fingerprint,
    hPct: annotation.rect.hPct,
    neighborText: annotation.anchor.neighborText,
    scrollX: annotation.scrollX,
    scrollY: annotation.scrollY,
    textPrefix: annotation.anchor.textPrefix,
    textSnippet: annotation.anchor.textSnippet,
    textSuffix: annotation.anchor.textSuffix,
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

export function createSitepingFeedback({
  githubIssuePublisher,
  sitepingFeedbackRepository,
}: CreateSitepingFeedbackDependencies) {
  return async ({
    authenticatedMember,
    command,
    requestUrl,
  }: CreateSitepingFeedbackInput): Promise<SitepingFeedbackResult> => {
    const result = await sitepingFeedbackRepository.create({
      annotations: command.annotations.map(flattenAnnotation),
      authorEmail: normalizeEmail(authenticatedMember.email),
      authorName: normalizeText(authenticatedMember.name),
      clientId: normalizeText(command.clientId),
      createdBy: authenticatedMember.id,
      diagnostics: sanitizeDiagnostics(command.diagnostics),
      message: redactSensitiveText(normalizeText(command.message)),
      projectName: normalizeText(command.projectName),
      screenshotUrl: null,
      type: command.type,
      url: redactSensitiveText(normalizeText(command.url)),
      urlPattern: normalizeOptionalText(command.urlPattern),
      userAgent: redactSensitiveText(normalizeText(command.userAgent)),
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
  ): Promise<SitepingFeedbackResult> => {
    const feedback = await sitepingFeedbackRepository.updateStatus(command);

    return serializeSitepingFeedback(feedback);
  };
}

export function deleteSitepingFeedback({
  githubIssuePublisher,
  sitepingFeedbackRepository,
}: {
  githubIssuePublisher: GitHubIssuePublisher;
  sitepingFeedbackRepository: SitepingFeedbackRepository;
}) {
  return async (command: SitepingFeedbackProjectCommand): Promise<void> => {
    const feedback = await sitepingFeedbackRepository.findById(command);

    if (feedback?.githubIssueNumber) {
      await githubIssuePublisher.close({
        feedbackId: feedback.id,
        issueNumber: feedback.githubIssueNumber,
      });
    }

    await sitepingFeedbackRepository.remove(command);
  };
}

export function deleteAllSitepingFeedback({
  sitepingFeedbackRepository,
}: {
  sitepingFeedbackRepository: SitepingFeedbackRepository;
}) {
  return async (projectName: string): Promise<void> => {
    await sitepingFeedbackRepository.removeAll(projectName);
  };
}
