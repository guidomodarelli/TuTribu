import type {
  CloseGitHubIssueCommand,
  GitHubIssuePublication,
  GitHubIssuePublisher,
  PublishGitHubIssueCommand,
} from "@/src/modules/siteping/domain/repositories/github-issue-publisher";
import type { SitepingFeedback } from "@/src/modules/siteping/domain/repositories/siteping-feedback-repository";
import { redactSitepingSensitiveText } from "@/src/modules/siteping/domain/services/siteping-sensitive-text-redaction";
import { getSitepingEnvironment } from "@/src/modules/siteping/infrastructure/environment/siteping-environment";
import {
  fetchWithResilience,
  type FetchResilienceOptions,
  type HttpFetcher,
  type HttpResponse,
} from "@/src/modules/shared/infrastructure/http/fetch-with-resilience";

const GITHUB_API = {
  accept: "application/vnd.github+json",
  apiVersion: "2022-11-28",
  baseUrl: "https://api.github.com",
  commentPath: "comments",
  contentType: "application/json",
  issuePath: "issues",
  maxCommentsPerPage: 100,
  tokenPrefix: "Bearer",
} as const;

const GITHUB_ISSUE_COPY = {
  author: "Author",
  consoleDiagnostics: "Console diagnostics",
  diagnostics: "Diagnostics",
  feedbackType: "Type",
  message: "Message",
  networkDiagnostics: "Network diagnostics",
  pageUrl: "URL",
  screenshot: "Screenshot",
  titlePrefix: "[SitePing]",
  userAgent: "User agent",
  viewport: "Viewport",
  widgetDeepLink: "Widget deep link",
} as const;

const GITHUB_ISSUE_TITLE = {
  maxLength: 256,
  separator: " ",
  truncationSuffix: "...",
} as const;

const GITHUB_ISSUE_STATE = {
  closed: "closed",
} as const;

const GITHUB_ISSUE_COMMENT = {
  deletedFeedback: "SitePing feedback {feedbackId} was deleted from LaTribu.",
} as const;

const GITHUB_FETCH_RESILIENCE: FetchResilienceOptions = {
  maxRetries: 1,
  retryDelayMs: 100,
  timeoutMs: 3000,
};

const GITHUB_ISSUE_CREATION_FETCH_RESILIENCE: Partial<FetchResilienceOptions> = {
  maxRetries: 0,
};

const REDACTION = {
  maxDiagnosticEntries: 5,
  maxMessageLength: 500,
} as const;

/** Blank line between Markdown sections in the GitHub issue body. */
const ISSUE_SECTION_SEPARATOR = "\n\n";

function redactText(value: string): string {
  return redactSitepingSensitiveText(value);
}

function truncateText(value: string): string {
  return value.length > REDACTION.maxMessageLength
    ? `${value.slice(0, REDACTION.maxMessageLength)}...`
    : value;
}

function buildDeepLink(feedback: SitepingFeedback, requestUrl: string): string {
  const fallbackUrl = new URL(requestUrl);
  const deepLinkUrl = new URL(feedback.url || fallbackUrl.origin, fallbackUrl.origin);

  deepLinkUrl.searchParams.set("siteping", feedback.id);

  return redactText(deepLinkUrl.toString());
}

function buildDiagnosticsSummary(feedback: SitepingFeedback): string {
  const diagnostics = feedback.diagnostics;

  if (!diagnostics) {
    return "No diagnostics were captured.";
  }

  const consoleEntries = diagnostics.console
    .slice(0, REDACTION.maxDiagnosticEntries)
    .map((entry) => `- ${entry.level}: ${truncateText(redactText(entry.message))}`);
  const networkEntries = diagnostics.network
    .slice(0, REDACTION.maxDiagnosticEntries)
    .map(
      (entry) =>
        `- ${entry.method} ${entry.status} ${redactText(entry.url)} (${entry.durationMs}ms)`
    );

  return [
    `### ${GITHUB_ISSUE_COPY.consoleDiagnostics}`,
    consoleEntries.length > 0 ? consoleEntries.join("\n") : "- none",
    `### ${GITHUB_ISSUE_COPY.networkDiagnostics}`,
    networkEntries.length > 0 ? networkEntries.join("\n") : "- none",
  ].join(ISSUE_SECTION_SEPARATOR);
}

const SCREENSHOT_PUBLIC_URL_PREFIX = "https://";

/**
 * Embeds the screenshot as a Markdown image only when it is a public URL.
 * Inline `data:` URLs do not render on GitHub, so they are omitted.
 *
 * @param feedback - Persisted SitePing feedback that may carry a screenshot URL.
 * @returns A Markdown screenshot section, or null when there is nothing to embed.
 */
function buildScreenshotSection(feedback: SitepingFeedback): string | null {
  const screenshotUrl = feedback.screenshotUrl;

  if (!screenshotUrl || !screenshotUrl.startsWith(SCREENSHOT_PUBLIC_URL_PREFIX)) {
    return null;
  }

  return [
    `## ${GITHUB_ISSUE_COPY.screenshot}`,
    `![${GITHUB_ISSUE_COPY.screenshot}](${screenshotUrl})`,
  ].join(ISSUE_SECTION_SEPARATOR);
}

function buildIssueBody(command: PublishGitHubIssueCommand): string {
  const { feedback, requestUrl } = command;

  const sections = [
    `## ${GITHUB_ISSUE_COPY.message}`,
    redactText(feedback.message),
    `## ${GITHUB_ISSUE_COPY.feedbackType}`,
    feedback.type,
    `## ${GITHUB_ISSUE_COPY.pageUrl}`,
    redactText(feedback.url),
    `## ${GITHUB_ISSUE_COPY.widgetDeepLink}`,
    buildDeepLink(feedback, requestUrl),
    `## ${GITHUB_ISSUE_COPY.viewport}`,
    feedback.viewport,
    `## ${GITHUB_ISSUE_COPY.userAgent}`,
    redactText(feedback.userAgent),
    `## ${GITHUB_ISSUE_COPY.author}`,
    `${feedback.authorName} <${feedback.authorEmail}>`,
    `## ${GITHUB_ISSUE_COPY.diagnostics}`,
    buildDiagnosticsSummary(feedback),
  ];

  const screenshotSection = buildScreenshotSection(feedback);
  if (screenshotSection) {
    sections.push(screenshotSection);
  }

  return sections.join(ISSUE_SECTION_SEPARATOR);
}

/**
 * Truncates a feedback message so the full prefixed GitHub issue title stays valid.
 *
 * @param value - Redacted feedback message used as the title-specific summary.
 * @returns Message summary that leaves room for the SitePing prefix and separator.
 */
function truncateIssueTitleMessage(value: string): string {
  const maxTitleMessageLength =
    GITHUB_ISSUE_TITLE.maxLength -
    GITHUB_ISSUE_COPY.titlePrefix.length -
    GITHUB_ISSUE_TITLE.separator.length;

  if (value.length <= maxTitleMessageLength) {
    return value;
  }

  return `${value.slice(
    0,
    maxTitleMessageLength - GITHUB_ISSUE_TITLE.truncationSuffix.length
  )}${GITHUB_ISSUE_TITLE.truncationSuffix}`;
}

/**
 * Builds a GitHub issue title within the provider title-length limit.
 *
 * @param feedback - Persisted SitePing feedback used to derive the title.
 * @returns GitHub issue title with a SitePing prefix and redacted message summary.
 */
function buildIssueTitle(feedback: SitepingFeedback): string {
  return `${GITHUB_ISSUE_COPY.titlePrefix}${GITHUB_ISSUE_TITLE.separator}${truncateIssueTitleMessage(redactText(feedback.message))}`;
}

function buildIssueUrl(repository: string): string {
  return `${GITHUB_API.baseUrl}/repos/${repository}/${GITHUB_API.issuePath}`;
}

function buildIssueResourceUrl(repository: string, issueNumber: number): string {
  return `${buildIssueUrl(repository)}/${issueNumber}`;
}

function buildIssueCommentUrl(repository: string, issueNumber: number): string {
  return `${buildIssueResourceUrl(repository, issueNumber)}/${GITHUB_API.commentPath}`;
}

function buildIssueCommentListUrl(repository: string, issueNumber: number): string {
  const commentsUrl = new URL(buildIssueCommentUrl(repository, issueNumber));

  commentsUrl.searchParams.set("per_page", String(GITHUB_API.maxCommentsPerPage));

  return commentsUrl.toString();
}

function buildDeletedFeedbackComment(feedbackId: string): string {
  return GITHUB_ISSUE_COMMENT.deletedFeedback.replace("{feedbackId}", feedbackId);
}

function isIssueResponse(value: unknown): value is {
  html_url: string;
  number: number;
} {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { html_url?: unknown }).html_url === "string" &&
    typeof (value as { number?: unknown }).number === "number"
  );
}

function isIssueCommentListResponse(value: unknown): value is Array<{ body: string }> {
  return (
    Array.isArray(value) &&
    value.every(
      (comment) =>
        Boolean(comment) &&
        typeof comment === "object" &&
        typeof (comment as { body?: unknown }).body === "string"
    )
  );
}

export class FetchGitHubIssuePublisher implements GitHubIssuePublisher {
  private readonly fetchResilienceOptions: Partial<FetchResilienceOptions>;

  constructor(fetchResilienceOptions: Partial<FetchResilienceOptions> = {}) {
    this.fetchResilienceOptions = fetchResilienceOptions;
  }

  private fetchGitHub(
    input: string,
    init: RequestInit,
    fetchResilienceOptions: Partial<FetchResilienceOptions> = {}
  ): Promise<HttpResponse> {
    const githubFetch: HttpFetcher = (fetchInput, requestInit) =>
      fetch(fetchInput, requestInit);

    return fetchWithResilience(githubFetch, input, init, {
      ...GITHUB_FETCH_RESILIENCE,
      ...this.fetchResilienceOptions,
      ...fetchResilienceOptions,
    });
  }

  async close(command: CloseGitHubIssueCommand): Promise<void> {
    const environment = getSitepingEnvironment();

    if (!environment.githubToken) {
      throw new Error("Siteping GitHub token is not configured.");
    }

    const commonHeaders = {
      accept: GITHUB_API.accept,
      authorization: `${GITHUB_API.tokenPrefix} ${environment.githubToken}`,
      "content-type": GITHUB_API.contentType,
      "x-github-api-version": GITHUB_API.apiVersion,
    };
    const closeResponse = await this.fetchGitHub(
      buildIssueResourceUrl(environment.githubRepository, command.issueNumber),
      {
        body: JSON.stringify({ state: GITHUB_ISSUE_STATE.closed }),
        headers: commonHeaders,
        method: "PATCH",
      }
    );

    if (!closeResponse.ok) {
      throw new Error(`GitHub issue close failed with status ${closeResponse.status}.`);
    }

    const deletedFeedbackComment = buildDeletedFeedbackComment(command.feedbackId);
    const commentListResponse = await this.fetchGitHub(
      buildIssueCommentListUrl(environment.githubRepository, command.issueNumber),
      {
        headers: commonHeaders,
        method: "GET",
      }
    );

    if (!commentListResponse.ok) {
      throw new Error(
        `GitHub issue comments lookup failed with status ${commentListResponse.status}.`
      );
    }

    const commentListPayload: unknown = await commentListResponse.json();

    if (!isIssueCommentListResponse(commentListPayload)) {
      throw new Error("GitHub issue comments lookup returned an invalid response.");
    }

    if (commentListPayload.some((comment) => comment.body === deletedFeedbackComment)) {
      return;
    }

    const commentResponse = await this.fetchGitHub(
      buildIssueCommentUrl(environment.githubRepository, command.issueNumber),
      {
        body: JSON.stringify({
          body: deletedFeedbackComment,
        }),
        headers: commonHeaders,
        method: "POST",
      }
    );

    if (!commentResponse.ok) {
      throw new Error(
        `GitHub issue deletion comment failed with status ${commentResponse.status}.`
      );
    }
  }

  async publish(command: PublishGitHubIssueCommand): Promise<GitHubIssuePublication> {
    const environment = getSitepingEnvironment();

    if (!environment.githubToken) {
      throw new Error("Siteping GitHub token is not configured.");
    }

    const response = await this.fetchGitHub(
      buildIssueUrl(environment.githubRepository),
      {
        body: JSON.stringify({
          body: buildIssueBody(command),
          labels: environment.githubLabels,
          title: buildIssueTitle(command.feedback),
        }),
        headers: {
          accept: GITHUB_API.accept,
          authorization: `${GITHUB_API.tokenPrefix} ${environment.githubToken}`,
          "content-type": GITHUB_API.contentType,
          "x-github-api-version": GITHUB_API.apiVersion,
        },
        method: "POST",
      },
      GITHUB_ISSUE_CREATION_FETCH_RESILIENCE
    );

    if (!response.ok) {
      throw new Error(`GitHub issue creation failed with status ${response.status}.`);
    }

    const payload: unknown = await response.json();

    if (!isIssueResponse(payload)) {
      throw new Error("GitHub issue creation returned an invalid response.");
    }

    return {
      issueNumber: payload.number,
      issueUrl: payload.html_url,
    };
  }
}
