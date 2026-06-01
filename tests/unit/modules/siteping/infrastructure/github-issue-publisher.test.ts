import { FetchGitHubIssuePublisher } from "@/src/modules/siteping/infrastructure/github/github-issue-publisher";
import {
  SITEPING_FEEDBACK_GITHUB_STATUS,
  SITEPING_FEEDBACK_STATUS,
  SITEPING_FEEDBACK_TYPE,
} from "@/src/modules/siteping/constants/siteping";
import type { SitepingFeedback } from "@/src/modules/siteping/domain/repositories/siteping-feedback-repository";

const fetchMock = jest.fn();
const GITHUB_ISSUE_TITLE_MAX_LENGTH = 256;
const SITEPING_TITLE_PREFIX = "[SitePing]";

function buildFeedback(overrides: Partial<SitepingFeedback> = {}): SitepingFeedback {
  return {
    annotations: [],
    authorEmail: "leader@example.com",
    authorName: "Leader Example",
    clientId: "client-feedback-1",
    createdAt: new Date("2026-05-31T12:00:00.000Z"),
    createdBy: "member-1",
    diagnostics: {
      console: [
        {
          level: "error",
          message:
            'Request failed token=secret Cookie: sid=abc; refresh=def set-cookie: auth-secret {"refresh_token":"json-secret","cookie":"json-cookie-secret"}',
          timestamp: "2026-05-31T12:00:00.000Z",
        },
      ],
      network: [
        {
          durationMs: 120,
          method: "GET",
          status: 500,
          timestamp: "2026-05-31T12:00:00.000Z",
          url: "https://tutribu.example.com/api/private?access_token=secret&api_key=secret&cookie=query-cookie-secret",
        },
      ],
    },
    githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.pending,
    id: "feedback-1",
    message: "No puedo guardar refresh_token=secret",
    projectName: "tutribu",
    resolvedAt: null,
    screenshotUrl: null,
    status: SITEPING_FEEDBACK_STATUS.open,
    type: SITEPING_FEEDBACK_TYPE.bug,
    updatedAt: new Date("2026-05-31T12:00:00.000Z"),
    url: "https://tutribu.example.com/precios?access_token=secret",
    urlPattern: "/precios",
    userAgent: "Bearer secret",
    viewport: "1280x800",
    ...overrides,
  };
}

describe("FetchGitHubIssuePublisher", () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnvironment,
      SITEPING_GITHUB_TOKEN: "github-token",
    };
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({
      json: jest.fn(async () => ({
        html_url: "https://github.com/guidomodarelli/LaTribu/issues/42",
        number: 42,
      })),
      ok: true,
    });
  });

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it("redacts sensitive values before publishing the GitHub issue", async () => {
    const publisher = new FetchGitHubIssuePublisher();

    await publisher.publish({
      feedback: buildFeedback(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      body: string;
      title: string;
    };

    expect(requestBody.title).toContain("refresh_token=[redacted]");
    expect(requestBody.body).toContain("access_token=[redacted]");
    expect(requestBody.body).toContain("api_key=[redacted]");
    expect(requestBody.body).toContain("Cookie: [redacted]");
    expect(requestBody.body).toContain("set-cookie: [redacted]");
    expect(requestBody.body).toContain('"refresh_token":"[redacted]"');
    expect(requestBody.body).toContain('"cookie":"[redacted]"');
    expect(requestBody.body).toContain("Bearer [redacted]");
    expect(requestBody.body).not.toContain("secret");
    expect(requestBody.body).not.toContain("refresh=def");
  });

  it("builds GitHub deep links from relative widget URLs", async () => {
    const publisher = new FetchGitHubIssuePublisher();

    await publisher.publish({
      feedback: buildFeedback({ url: "/matematica/precios" }),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      body: string;
    };

    expect(requestBody.body).toContain(
      "https://tutribu.example.com/matematica/precios?siteping=feedback-1"
    );
  });

  it("truncates the GitHub issue title without truncating the feedback body message", async () => {
    const longFeedbackMessage = "a".repeat(GITHUB_ISSUE_TITLE_MAX_LENGTH);
    const publisher = new FetchGitHubIssuePublisher();

    await publisher.publish({
      feedback: buildFeedback({ message: longFeedbackMessage }),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      body: string;
      title: string;
    };

    expect(requestBody.title).toHaveLength(GITHUB_ISSUE_TITLE_MAX_LENGTH);
    expect(requestBody.title.startsWith(SITEPING_TITLE_PREFIX)).toBe(true);
    expect(requestBody.title).toContain("...");
    expect(requestBody.body).toContain(longFeedbackMessage);
  });

  it("bounds stalled GitHub issue publication with the resilience timeout", async () => {
    fetchMock.mockImplementation((_, init: RequestInit | undefined) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    const publisher = new FetchGitHubIssuePublisher({
      maxRetries: 0,
      retryDelayMs: 0,
      timeoutMs: 5,
    });

    await expect(
      publisher.publish({
        feedback: buildFeedback(),
        requestUrl: "https://tutribu.example.com/api/siteping",
      })
    ).rejects.toThrow("Request timed out");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/guidomodarelli/LaTribu/issues",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("does not retry retryable GitHub issue creation failures", async () => {
    fetchMock.mockResolvedValue({
      json: jest.fn(async () => ({})),
      ok: false,
      status: 502,
    });
    const publisher = new FetchGitHubIssuePublisher();

    await expect(
      publisher.publish({
        feedback: buildFeedback(),
        requestUrl: "https://tutribu.example.com/api/siteping",
      })
    ).rejects.toThrow("GitHub issue creation failed with status 502.");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/guidomodarelli/LaTribu/issues",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("closes and comments the GitHub issue linked to deleted feedback", async () => {
    const publisher = new FetchGitHubIssuePublisher();

    await publisher.close({
      feedbackId: "feedback-1",
      issueNumber: 42,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/guidomodarelli/LaTribu/issues/42",
      expect.objectContaining({
        body: JSON.stringify({ state: "closed" }),
        method: "PATCH",
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/guidomodarelli/LaTribu/issues/42/comments",
      expect.objectContaining({
        body: JSON.stringify({
          body: "SitePing feedback feedback-1 was deleted from LaTribu.",
        }),
        method: "POST",
      })
    );
  });
});
