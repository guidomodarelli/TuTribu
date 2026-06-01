import type {
  CloseGitHubIssueCommand,
  GitHubIssuePublication,
  GitHubIssuePublisher,
  PublishGitHubIssueCommand,
} from "@/src/modules/siteping/domain/repositories/github-issue-publisher";
import type { SitepingFeedback } from "@/src/modules/siteping/domain/repositories/siteping-feedback-repository";
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
  titlePrefix: "[SitePing]",
  userAgent: "User agent",
  viewport: "Viewport",
  widgetDeepLink: "Widget deep link",
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

const REDACTION = {
  hiddenValue: "[redacted]",
  maxDiagnosticEntries: 5,
  maxMessageLength: 500,
  sensitiveJsonKeyValuePattern:
    /("[^"]*(?:token|key|password|secret|code|state|session|auth)[^"]*"\s*:\s*)"[^"]*"/gi,
  sensitiveKeyValuePattern:
    /\b([a-z0-9_-]*(?:token|key|password|secret|code|state|session|auth)[a-z0-9_-]*)(=|:\s*)[^\s,;)&]+/gi,
  sensitiveQueryPattern:
    /([?&][^=&]*(?:token|key|password|secret|code|state|session|auth)[^=&]*=)[^&]+/gi,
  tokenLikePattern: /(bearer\s+)[a-z0-9._-]+/gi,
} as const;

function redactText(value: string): string {
  return value
    .replace(REDACTION.sensitiveQueryPattern, `$1${REDACTION.hiddenValue}`)
    .replace(
      REDACTION.sensitiveJsonKeyValuePattern,
      `$1"${REDACTION.hiddenValue}"`
    )
    .replace(
      REDACTION.sensitiveKeyValuePattern,
      `$1$2${REDACTION.hiddenValue}`
    )
    .replace(REDACTION.tokenLikePattern, `$1${REDACTION.hiddenValue}`);
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
  ].join("\n\n");
}

function buildIssueBody(command: PublishGitHubIssueCommand): string {
  const { feedback, requestUrl } = command;

  return [
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
  ].join("\n\n");
}

function buildIssueTitle(feedback: SitepingFeedback): string {
  return `${GITHUB_ISSUE_COPY.titlePrefix} ${truncateText(redactText(feedback.message))}`;
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

export class FetchGitHubIssuePublisher implements GitHubIssuePublisher {
  private readonly fetchResilienceOptions: Partial<FetchResilienceOptions>;

  constructor(fetchResilienceOptions: Partial<FetchResilienceOptions> = {}) {
    this.fetchResilienceOptions = fetchResilienceOptions;
  }

  private fetchGitHub(input: string, init: RequestInit): Promise<HttpResponse> {
    const githubFetch: HttpFetcher = (fetchInput, requestInit) =>
      fetch(fetchInput, requestInit);

    return fetchWithResilience(githubFetch, input, init, {
      ...GITHUB_FETCH_RESILIENCE,
      ...this.fetchResilienceOptions,
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

    const commentResponse = await this.fetchGitHub(
      buildIssueCommentUrl(environment.githubRepository, command.issueNumber),
      {
        body: JSON.stringify({
          body: buildDeletedFeedbackComment(command.feedbackId),
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

    const response = await this.fetchGitHub(buildIssueUrl(environment.githubRepository), {
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
    });

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
