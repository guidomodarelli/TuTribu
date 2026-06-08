import {
  createSitepingFeedback,
  deleteSitepingFeedback,
  getSitepingIdentity,
  listSitepingFeedback,
  updateSitepingFeedbackStatus,
} from "@/src/modules/siteping/application/use-cases/manage-siteping-feedback-use-cases";
import type { SitepingFeedbackRepository } from "@/src/modules/siteping/domain/repositories/siteping-feedback-repository";
import type { GitHubIssuePublisher } from "@/src/modules/siteping/domain/repositories/github-issue-publisher";
import type { SitepingScreenshotStorage } from "@/src/modules/siteping/domain/repositories/siteping-screenshot-storage";
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
    findByIdempotencyKey: jest.fn(async () => null),
    findPage: jest.fn(),
    markGitHubIssueDeletionCompleted: jest.fn(),
    markGitHubIssueDeletionPending: jest.fn(),
    markGitHubIssueFailed: jest.fn(),
    markGitHubIssuePublished: jest.fn(),
    remove: jest.fn(),
    restoreGitHubIssuePublished: jest.fn(),
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

function buildScreenshotStorage(
  overrides: Partial<SitepingScreenshotStorage> = {}
): SitepingScreenshotStorage {
  return {
    delete: jest.fn(async () => undefined),
    store: jest.fn(async () => null),
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
      screenshotStorage: buildScreenshotStorage(),
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

  it("persists the Cloudflare URL when the screenshot upload succeeds", async () => {
    const repository = buildRepository();
    const deliveryUrl = "https://imagedelivery.net/hash/image-1/public";
    const screenshotStorage = buildScreenshotStorage({
      store: jest.fn(async () => deliveryUrl),
    });
    const useCase = createSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(screenshotStorage.store).toHaveBeenCalledWith({
      dataUrl: "data:image/jpeg;base64,secret",
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ screenshotUrl: deliveryUrl })
    );
    expect(screenshotStorage.delete).not.toHaveBeenCalled();
  });

  it("persists null instead of the inline data URL when the screenshot upload fails", async () => {
    const repository = buildRepository();
    const screenshotStorage = buildScreenshotStorage({
      store: jest.fn(async () => null),
    });
    const useCase = createSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(screenshotStorage.store).toHaveBeenCalledWith({
      dataUrl: "data:image/jpeg;base64,secret",
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ screenshotUrl: null })
    );
  });

  it("clamps untrusted network diagnostic methods before persisting feedback", async () => {
    const repository = buildRepository();
    const publisher = buildPublisher();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage: buildScreenshotStorage(),
      sitepingFeedbackRepository: repository,
    });
    const command = buildFeedbackCommand();

    command.diagnostics.network[0].method = "POST access_token=secret";

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command,
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        diagnostics: expect.objectContaining({
          network: [
            expect.objectContaining({
              method: "[redacted]",
            }),
          ],
        }),
      })
    );
    expect(repository.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        diagnostics: expect.objectContaining({
          network: [
            expect.objectContaining({
              method: expect.stringContaining("secret"),
            }),
          ],
        }),
      })
    );
  });

  it("redacts sensitive annotation text before persisting feedback", async () => {
    const repository = buildRepository();
    const publisher = buildPublisher();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage: buildScreenshotStorage(),
      sitepingFeedbackRepository: repository,
    });
    const command = buildFeedbackCommand();

    command.annotations[0].anchor.neighborText =
      "Plan premium password=visible-secret";
    command.annotations[0].anchor.textPrefix =
      "Session starts Cookie: sid=visible-secret token=visible-secret";
    command.annotations[0].anchor.textSnippet =
      "Reset password token=visible-secret";
    command.annotations[0].anchor.textSuffix =
      'Payload {"refresh_token":"visible-secret","cookie":"visible-secret"}';

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command,
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        annotations: [
          expect.objectContaining({
            neighborText: "Plan premium password=[redacted]",
            textPrefix: "Session starts Cookie: [redacted]",
            textSnippet: "Reset password token=[redacted]",
            textSuffix:
              'Payload {"refresh_token":"[redacted]","cookie":"[redacted]"}',
          }),
        ],
      })
    );
    expect(repository.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        annotations: [
          expect.objectContaining({
            textSnippet: expect.stringContaining("visible-secret"),
          }),
        ],
      })
    );
  });

  it("redacts sensitive persisted annotation text before returning feedback lists", async () => {
    const repository = buildRepository({
      findPage: jest.fn(async () => ({
        feedbacks: [
          {
            annotations: [
              {
                anchorKey: null,
                createdAt: new Date("2026-05-31T12:00:00.000Z"),
                cssSelector: "[data-feedback-anchor='pricing']",
                devicePixelRatio: 1,
                elementId: "pricing",
                elementTag: "SECTION",
                feedbackId: FEEDBACK_ID,
                fingerprint: "1:0:abc",
                hPct: 0.2,
                id: "annotation-1",
                neighborText: "Plan premium password=visible-secret",
                scrollX: 0,
                scrollY: 120,
                textPrefix: "Session starts Cookie: sid=visible-secret",
                textSnippet: "Reset password token=visible-secret",
                textSuffix:
                  'Payload {"refresh_token":"visible-secret","cookie":"visible-secret"}',
                viewportH: 800,
                viewportW: 1280,
                wPct: 0.3,
                xpath: "/html/body/section[1]",
                xPct: 0.1,
                yPct: 0.4,
              },
            ],
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
        ],
        total: 1,
      })),
    });
    const useCase = listSitepingFeedback({
      sitepingFeedbackRepository: repository,
    });

    const result = await useCase({
      limit: 20,
      offset: 0,
      projectName: "tutribu",
      status: "open",
    });

    expect(result.feedbacks[0].annotations[0]).toEqual(
      expect.objectContaining({
        neighborText: "Plan premium password=[redacted]",
        textPrefix: "Session starts Cookie: [redacted]",
        textSnippet: "Reset password token=[redacted]",
        textSuffix:
          'Payload {"refresh_token":"[redacted]","cookie":"[redacted]"}',
      })
    );
    expect(JSON.stringify(result)).not.toContain("visible-secret");
  });

  it("drops untrusted diagnostic fields before persisting feedback", async () => {
    const repository = buildRepository();
    const publisher = buildPublisher();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage: buildScreenshotStorage(),
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
    const screenshotStorage = buildScreenshotStorage();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(publisher.publish).not.toHaveBeenCalled();
    expect(repository.markGitHubIssuePublished).not.toHaveBeenCalled();
    expect(screenshotStorage.delete).not.toHaveBeenCalled();
  });

  it("deletes the just-uploaded screenshot when the create resolves an idempotency conflict", async () => {
    const screenshotUrl = "https://imagedelivery.net/hash/image-1/public";
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
          screenshotUrl: "https://imagedelivery.net/hash/winning-image/public",
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
    const screenshotStorage = buildScreenshotStorage({
      store: jest.fn(async () => screenshotUrl),
    });
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(screenshotStorage.store).toHaveBeenCalledTimes(1);
    expect(screenshotStorage.delete).toHaveBeenCalledWith({ screenshotUrl });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("reuses the existing idempotent feedback without uploading another screenshot", async () => {
    const existingFeedback = {
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
      screenshotUrl: "https://imagedelivery.net/hash/image-1/public",
      status: "open" as const,
      type: SITEPING_FEEDBACK_TYPE.bug,
      updatedAt: new Date("2026-05-31T12:00:00.000Z"),
      url: "https://tutribu.example.com/matematica/precios",
      urlPattern: "/[slug]/precios",
      userAgent: "Jest Browser",
      viewport: "1280x800",
    };
    const repository = buildRepository({
      findByIdempotencyKey: jest.fn(async () => existingFeedback),
    });
    const publisher = buildPublisher();
    const screenshotStorage = buildScreenshotStorage();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    const result = await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(repository.findByIdempotencyKey).toHaveBeenCalledWith({
      clientId: "client-feedback-1",
      createdBy: "member-1",
      projectName: "tutribu",
    });
    expect(screenshotStorage.store).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: FEEDBACK_ID }));
  });

  it("uploads the screenshot only after confirming the submission is new", async () => {
    const repository = buildRepository();
    const screenshotStorage = buildScreenshotStorage({
      store: jest.fn(async () => "https://imagedelivery.net/hash/image-1/public"),
    });
    const useCase = createSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(repository.findByIdempotencyKey).toHaveBeenCalledWith({
      clientId: "client-feedback-1",
      createdBy: "member-1",
      projectName: "tutribu",
    });
    expect(screenshotStorage.store).toHaveBeenCalledTimes(1);
    expect(
      (repository.findByIdempotencyKey as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan((screenshotStorage.store as jest.Mock).mock.invocationCallOrder[0]);
    expect((screenshotStorage.store as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (repository.create as jest.Mock).mock.invocationCallOrder[0]
    );
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
      screenshotStorage: buildScreenshotStorage(),
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
      screenshotStorage: buildScreenshotStorage(),
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

  it("marks deletion as pending before closing the linked GitHub issue", async () => {
    const repository = buildRepository();
    const publisher = buildPublisher();
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage: buildScreenshotStorage(),
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
    expect(repository.markGitHubIssueDeletionPending).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });
    expect(repository.markGitHubIssueDeletionCompleted).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
    });
    expect(repository.remove).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });
    expect(
      (repository.markGitHubIssueDeletionPending as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan((publisher.close as jest.Mock).mock.invocationCallOrder[0]);
    expect((publisher.close as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (repository.remove as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  it("removes completed deletion feedback without closing the GitHub issue again", async () => {
    const repository = buildRepository({
      findById: jest.fn(async () => ({
        annotations: [],
        authorEmail: "leader@example.com",
        authorName: "Leader Example",
        clientId: "client-feedback-1",
        createdAt: new Date("2026-05-31T12:00:00.000Z"),
        createdBy: "member-1",
        diagnostics: null,
        githubIssueNumber: 42,
        githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.deletionCompleted,
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
    });
    const publisher = buildPublisher();
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage: buildScreenshotStorage(),
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });

    expect(publisher.close).not.toHaveBeenCalled();
    expect(repository.markGitHubIssueDeletionPending).not.toHaveBeenCalled();
    expect(repository.markGitHubIssueDeletionCompleted).not.toHaveBeenCalled();
    expect(repository.remove).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });
  });

  it("deletes the stored screenshot before removing the feedback record", async () => {
    const screenshotUrl = "https://imagedelivery.net/hash/image-1/public";
    const repository = buildRepository({
      findById: jest.fn(async () => ({
        annotations: [],
        authorEmail: "leader@example.com",
        authorName: "Leader Example",
        clientId: "client-feedback-1",
        createdAt: new Date("2026-05-31T12:00:00.000Z"),
        createdBy: "member-1",
        diagnostics: null,
        githubIssueNumber: 42,
        githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.deletionCompleted,
        githubIssueUrl: "https://github.com/guidomodarelli/LaTribu/issues/42",
        id: FEEDBACK_ID,
        message: "No puedo guardar el precio",
        projectName: "tutribu",
        resolvedAt: null,
        screenshotUrl,
        status: "open",
        type: SITEPING_FEEDBACK_TYPE.bug,
        updatedAt: new Date("2026-05-31T12:00:00.000Z"),
        url: "https://tutribu.example.com/matematica/precios",
        urlPattern: "/[slug]/precios",
        userAgent: "Jest Browser",
        viewport: "1280x800",
      })),
    });
    const screenshotStorage = buildScreenshotStorage();
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });

    expect(screenshotStorage.delete).toHaveBeenCalledWith({ screenshotUrl });
    expect(repository.remove).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });
    expect(
      (screenshotStorage.delete as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan((repository.remove as jest.Mock).mock.invocationCallOrder[0]);
  });

  it("does not attempt screenshot deletion when the feedback has no screenshot", async () => {
    const repository = buildRepository();
    const screenshotStorage = buildScreenshotStorage();
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });

    expect(screenshotStorage.delete).not.toHaveBeenCalled();
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
      screenshotStorage: buildScreenshotStorage(),
      sitepingFeedbackRepository: repository,
    });

    await expect(useCase({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    })).rejects.toThrow("github_close_failed");

    expect(repository.remove).not.toHaveBeenCalled();
    expect(repository.restoreGitHubIssuePublished).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
    });
  });

  it("returns null when feedback status update finds no matching project feedback", async () => {
    const repository = buildRepository({
      updateStatus: jest.fn(async () => null),
    });
    const useCase = updateSitepingFeedbackStatus({
      sitepingFeedbackRepository: repository,
    });

    await expect(useCase({
      feedbackId: FEEDBACK_ID,
      projectName: "another-project",
      status: "resolved",
    })).resolves.toBeNull();

    expect(repository.updateStatus).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      projectName: "another-project",
      status: "resolved",
    });
  });
});
