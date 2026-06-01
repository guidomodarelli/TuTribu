import {
  createSitepingFeedback,
  deleteSitepingFeedback,
  getSitepingIdentity,
} from "@/src/modules/siteping/application/use-cases/manage-siteping-feedback-use-cases";
import type { SitepingFeedbackRepository } from "@/src/modules/siteping/domain/repositories/siteping-feedback-repository";
import type { GitHubIssuePublisher } from "@/src/modules/siteping/domain/repositories/github-issue-publisher";
import {
  SITEPING_FEEDBACK_GITHUB_STATUS,
  SITEPING_FEEDBACK_TYPE,
} from "@/src/modules/siteping/constants/siteping";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";

const FEEDBACK_ID = "11111111-1111-4111-8111-111111111111";

function buildAuthenticatedMember(
  email = "leader@example.com"
): AuthenticatedMemberResult {
  return {
    avatarFallback: "LE",
    email,
    id: "member-1",
    image: null,
    name: "Leader Example",
    role: "tribemate",
  };
}

function buildFeedbackCommand() {
  return {
    annotations: [
      {
        anchor: {
          cssSelector: "[data-feedback-anchor='pricing']",
          elementId: "pricing",
          elementTag: "SECTION",
          fingerprint: "1:0:abc",
          neighborText: "Planes",
          textPrefix: "Antes",
          textSnippet: "Precio mensual",
          textSuffix: "Despues",
          xpath: "/html/body/section[1]",
        },
        rect: {
          hPct: 0.2,
          wPct: 0.3,
          xPct: 0.1,
          yPct: 0.4,
        },
        devicePixelRatio: 1,
        scrollX: 0,
        scrollY: 120,
        viewportH: 800,
        viewportW: 1280,
      },
    ],
    authorEmail: "spoofed@example.com",
    authorName: "Spoofed Author",
    clientId: "client-feedback-1",
    diagnostics: {
      console: [
        {
          level: "error" as const,
          message:
            'Failed request token=secret Cookie: sid=abc; refresh=def set-cookie: auth-secret {"refresh_token":"json-secret","cookie":"json-cookie-secret"}',
          timestamp: "2026-05-31T12:00:00.000Z",
        },
      ],
      network: [
        {
          durationMs: 250,
          method: "GET",
          status: 500,
          timestamp: "2026-05-31T12:00:00.000Z",
          url: "https://tutribu.example.com/api/private?access_token=secret&api_key=secret&cookie=query-cookie-secret",
        },
      ],
    },
    message: "No puedo guardar el precio",
    projectName: "tutribu",
    screenshotDataUrl: "data:image/jpeg;base64,secret",
    type: SITEPING_FEEDBACK_TYPE.bug,
    url: "https://tutribu.example.com/matematica/precios?refresh_token=secret",
    urlPattern: "/[slug]/precios",
    userAgent: "Jest Browser",
    viewport: "1280x800",
  };
}

function buildMemberTribe(
  overrides: Partial<MemberTribeListItemResult> = {}
): MemberTribeListItemResult {
  return {
    membershipStatus: TRIBE_MEMBERSHIP_STATUS.active,
    name: "Matematica",
    role: TRIBE_MEMBER_ROLE.leader,
    slug: "matematica",
    tribeId: "tribe-1",
    ...overrides,
  };
}

function buildRepository(
  overrides: Partial<SitepingFeedbackRepository> = {}
): SitepingFeedbackRepository {
  return {
    create: jest.fn(async () => ({
      feedback: {
        annotations: [],
        authorEmail: "leader@example.com",
        authorName: "Leader Example",
        clientId: "client-feedback-1",
        createdAt: new Date("2026-05-31T12:00:00.000Z"),
        createdBy: "member-1",
        diagnostics: null,
        githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.pending,
        id: FEEDBACK_ID,
        message: "No puedo guardar el precio",
        projectName: "tutribu",
        resolvedAt: null,
        screenshotUrl: null,
        status: "open",
        type: SITEPING_FEEDBACK_TYPE.bug,
        updatedAt: new Date("2026-05-31T12:00:00.000Z"),
        url: "https://tutribu.example.com/matematica/precios",
        urlPattern: "/[slug]/precios",
        userAgent: "Jest Browser",
        viewport: "1280x800",
      },
      wasCreated: true,
    })),
    findById: jest.fn(async () => ({
      annotations: [],
      authorEmail: "leader@example.com",
      authorName: "Leader Example",
      clientId: "client-feedback-1",
      createdAt: new Date("2026-05-31T12:00:00.000Z"),
      createdBy: "member-1",
      diagnostics: null,
      githubIssueNumber: 42,
      githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.published,
      githubIssueUrl: "https://github.com/guidomodarelli/LaTribu/issues/42",
      id: FEEDBACK_ID,
      message: "No puedo guardar el precio",
      projectName: "tutribu",
      resolvedAt: null,
      screenshotUrl: null,
      status: "open",
      type: SITEPING_FEEDBACK_TYPE.bug,
      updatedAt: new Date("2026-05-31T12:00:00.000Z"),
      url: "https://tutribu.example.com/matematica/precios",
      urlPattern: "/[slug]/precios",
      userAgent: "Jest Browser",
      viewport: "1280x800",
    })),
    findPage: jest.fn(),
    markGitHubIssueFailed: jest.fn(),
    markGitHubIssuePublished: jest.fn(),
    remove: jest.fn(),
    removeAll: jest.fn(),
    updateStatus: jest.fn(),
    ...overrides,
  };
}

function buildPublisher(
  overrides: Partial<GitHubIssuePublisher> = {}
): GitHubIssuePublisher {
  return {
    close: jest.fn(async () => undefined),
    publish: jest.fn(async () => ({
      issueNumber: 42,
      issueUrl: "https://github.com/guidomodarelli/LaTribu/issues/42",
    })),
    ...overrides,
  };
}

describe("manage Siteping feedback use cases", () => {
  it("enables identity when the member email is allowed", () => {
    const useCase = getSitepingIdentity({
      allowedEmails: ["leader@example.com"],
      enabled: true,
    });

    expect(
      useCase({
        authenticatedMember: buildAuthenticatedMember(),
        memberTribes: [],
      })
    ).toEqual({
      enabled: true,
      identity: {
        email: "leader@example.com",
        name: "Leader Example",
      },
      projectName: "tutribu",
    });
  });

  it("enables identity when the member has an active leader or guardian membership", () => {
    const useCase = getSitepingIdentity({
      allowedEmails: [],
      enabled: true,
    });

    expect(
      useCase({
        authenticatedMember: buildAuthenticatedMember("other@example.com"),
        memberTribes: [buildMemberTribe({ role: TRIBE_MEMBER_ROLE.guardian })],
      })
    ).toEqual({
      enabled: true,
      identity: {
        email: "other@example.com",
        name: "Leader Example",
      },
      projectName: "tutribu",
    });
  });

  it("disables identity when the member is not in the email list or a privileged membership", () => {
    const useCase = getSitepingIdentity({
      allowedEmails: ["leader@example.com"],
      enabled: true,
    });

    expect(
      useCase({
        authenticatedMember: buildAuthenticatedMember("other@example.com"),
        memberTribes: [buildMemberTribe({ role: TRIBE_MEMBER_ROLE.tribemate })],
      })
    ).toEqual({
      enabled: false,
      identity: null,
      projectName: "tutribu",
    });
    expect(
      useCase({
        authenticatedMember: buildAuthenticatedMember("other@example.com"),
        memberTribes: [
          buildMemberTribe({
            membershipStatus: TRIBE_MEMBERSHIP_STATUS.muted,
            role: TRIBE_MEMBER_ROLE.leader,
          }),
        ],
      })
    ).toEqual({
      enabled: false,
      identity: null,
      projectName: "tutribu",
    });
  });

  it("creates feedback with safe authenticated author data and sanitized diagnostics", async () => {
    const repository = buildRepository();
    const publisher = buildPublisher();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authorEmail: "leader@example.com",
        authorName: "Leader Example",
        diagnostics: {
          console: [
            expect.objectContaining({
              message:
                'Failed request token=[redacted] Cookie: [redacted] set-cookie: [redacted] {"refresh_token":"[redacted]","cookie":"[redacted]"}',
            }),
          ],
          network: [
            expect.objectContaining({
              url: "https://tutribu.example.com/api/private?access_token=[redacted]&api_key=[redacted]&cookie=[redacted]",
            }),
          ],
        },
        message: "No puedo guardar el precio",
        screenshotUrl: null,
        url: "https://tutribu.example.com/matematica/precios?refresh_token=[redacted]",
      })
    );
    expect(repository.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        authorEmail: "spoofed@example.com",
        authorName: "Spoofed Author",
        diagnostics: expect.objectContaining({
          console: [
            expect.objectContaining({
              message: expect.stringMatching(/secret|refresh=def/),
            }),
          ],
        }),
      })
    );
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(repository.markGitHubIssuePublished).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      issueNumber: 42,
      issueUrl: "https://github.com/guidomodarelli/LaTribu/issues/42",
    });
  });

  it("drops untrusted diagnostic fields before persisting feedback", async () => {
    const repository = buildRepository();
    const publisher = buildPublisher();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      sitepingFeedbackRepository: repository,
    });
    const command = buildFeedbackCommand();
    const diagnosticPayload = command.diagnostics as unknown as {
      console: Array<Record<string, unknown>>;
      network: Array<Record<string, unknown>>;
    };

    diagnosticPayload.console[0].cookie = "session=secret";
    diagnosticPayload.network[0].headers = {
      authorization: "Bearer secret",
      cookie: "session=secret",
    };
    diagnosticPayload.network[0].requestBody = {
      refresh_token: "secret",
    };

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command,
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        diagnostics: {
          console: [
            {
              level: "error",
              message:
                'Failed request token=[redacted] Cookie: [redacted] set-cookie: [redacted] {"refresh_token":"[redacted]","cookie":"[redacted]"}',
              timestamp: "2026-05-31T12:00:00.000Z",
            },
          ],
          network: [
            {
              durationMs: 250,
              method: "GET",
              status: 500,
              timestamp: "2026-05-31T12:00:00.000Z",
              url: "https://tutribu.example.com/api/private?access_token=[redacted]&api_key=[redacted]&cookie=[redacted]",
            },
          ],
        },
      })
    );
  });

  it("does not publish a duplicate GitHub issue for an existing client id", async () => {
    const repository = buildRepository({
      create: jest.fn(async () => ({
        feedback: {
          annotations: [],
          authorEmail: "leader@example.com",
          authorName: "Leader Example",
          clientId: "client-feedback-1",
          createdAt: new Date("2026-05-31T12:00:00.000Z"),
          createdBy: "member-1",
          diagnostics: null,
          githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.published,
          id: FEEDBACK_ID,
          message: "No puedo guardar el precio",
          projectName: "tutribu",
          resolvedAt: null,
          screenshotUrl: null,
          status: "open",
          type: SITEPING_FEEDBACK_TYPE.bug,
          updatedAt: new Date("2026-05-31T12:00:00.000Z"),
          url: "https://tutribu.example.com/matematica/precios",
          urlPattern: "/[slug]/precios",
          userAgent: "Jest Browser",
          viewport: "1280x800",
        },
        wasCreated: false,
      })),
    });
    const publisher = buildPublisher();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(publisher.publish).not.toHaveBeenCalled();
    expect(repository.markGitHubIssuePublished).not.toHaveBeenCalled();
  });

  it("keeps the feedback when GitHub issue creation fails", async () => {
    const repository = buildRepository();
    const publisher = buildPublisher({
      publish: jest.fn(async () => {
        throw new Error("github_failed");
      }),
    });
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      sitepingFeedbackRepository: repository,
    });

    await expect(
      useCase({
        authenticatedMember: buildAuthenticatedMember(),
        command: buildFeedbackCommand(),
        requestUrl: "https://tutribu.example.com/api/siteping",
      })
    ).resolves.toEqual(expect.objectContaining({ id: FEEDBACK_ID }));

    expect(repository.markGitHubIssueFailed).toHaveBeenCalledWith({
      errorMessage: "github_failed",
      feedbackId: FEEDBACK_ID,
    });
  });

  it("does not mark publication as failed when storing the created GitHub issue fails", async () => {
    const repository = buildRepository({
      markGitHubIssuePublished: jest.fn(async () => {
        throw new Error("database_connection_interrupted");
      }),
    });
    const publisher = buildPublisher();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      sitepingFeedbackRepository: repository,
    });

    await expect(
      useCase({
        authenticatedMember: buildAuthenticatedMember(),
        command: buildFeedbackCommand(),
        requestUrl: "https://tutribu.example.com/api/siteping",
      })
    ).resolves.toEqual(expect.objectContaining({ id: FEEDBACK_ID }));

    expect(repository.markGitHubIssuePublished).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      issueNumber: 42,
      issueUrl: "https://github.com/guidomodarelli/LaTribu/issues/42",
    });
    expect(repository.markGitHubIssueFailed).not.toHaveBeenCalled();
  });

  it("closes the linked GitHub issue before deleting an individual feedback", async () => {
    const repository = buildRepository();
    const publisher = buildPublisher();
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: publisher,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });

    expect(repository.findById).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });
    expect(publisher.close).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      issueNumber: 42,
    });
    expect(repository.remove).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });
  });

  it("does not delete local feedback when closing the linked GitHub issue fails", async () => {
    const repository = buildRepository();
    const publisher = buildPublisher({
      close: jest.fn(async () => {
        throw new Error("github_close_failed");
      }),
    });
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: publisher,
      sitepingFeedbackRepository: repository,
    });

    await expect(useCase({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    })).rejects.toThrow("github_close_failed");

    expect(repository.remove).not.toHaveBeenCalled();
  });
});
