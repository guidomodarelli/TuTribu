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
  SITEPING_SCREENSHOT_UPLOAD_RACE_WINDOW_MS,
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
    attachScreenshotUrl: jest.fn(async () => ({ screenshotAttached: true })),
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
    delete: jest.fn(async () => ({ screenshotCleared: true })),
    store: jest.fn(async () => null),
    ...overrides,
  };
}

function buildFeedbackLogger() {
  return { warn: jest.fn() };
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

  it("creates the row without a screenshot, then attaches the uploaded Cloudflare URL", async () => {
    const repository = buildRepository();
    const deliveryUrl = "https://imagedelivery.net/hash/image-1/public";
    const screenshotStorage = buildScreenshotStorage({
      store: jest.fn(async () => deliveryUrl),
    });
    const publisher = buildPublisher();
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

    expect(screenshotStorage.store).toHaveBeenCalledWith({
      dataUrl: "data:image/jpeg;base64,secret",
    });
    // The row is created without a screenshot first, so a failed insert never
    // strands a just-uploaded public image with no row to drive its cleanup.
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ screenshotUrl: null })
    );
    expect(repository.attachScreenshotUrl).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      screenshotUrl: deliveryUrl,
    });
    expect(screenshotStorage.delete).not.toHaveBeenCalled();
    // The attached URL reaches the GitHub issue and the response view model.
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback: expect.objectContaining({ screenshotUrl: deliveryUrl }),
      })
    );
    expect(result.screenshotUrl).toBe(deliveryUrl);
  });

  it("keeps no screenshot without attaching when the upload fails", async () => {
    const repository = buildRepository();
    const screenshotStorage = buildScreenshotStorage({
      store: jest.fn(async () => null),
    });
    const useCase = createSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    const result = await useCase({
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
    expect(repository.attachScreenshotUrl).not.toHaveBeenCalled();
    expect(screenshotStorage.delete).not.toHaveBeenCalled();
    expect(result.screenshotUrl).toBeNull();
  });

  it("keeps the feedback and reclaims the orphan when attaching the screenshot fails", async () => {
    const deliveryUrl = "https://imagedelivery.net/hash/image-1/public";
    const repository = buildRepository({
      attachScreenshotUrl: jest.fn(async () => {
        throw new Error("database_connection_interrupted");
      }),
    });
    const screenshotStorage = buildScreenshotStorage({
      store: jest.fn(async () => deliveryUrl),
    });
    const publisher = buildPublisher();
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

    // Linking failed after a successful upload, so the orphan is reclaimed
    // best-effort and the feedback still ships without a screenshot.
    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl: deliveryUrl,
    });
    expect(result.screenshotUrl).toBeNull();
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback: expect.objectContaining({ screenshotUrl: null }),
      })
    );
  });

  it("reclaims the screenshot and keeps no screenshot when the attach matches no row", async () => {
    const deliveryUrl = "https://imagedelivery.net/hash/image-1/public";
    const repository = buildRepository({
      attachScreenshotUrl: jest.fn(async () => ({ screenshotAttached: false })),
    });
    const screenshotStorage = buildScreenshotStorage({
      store: jest.fn(async () => deliveryUrl),
    });
    const publisher = buildPublisher();
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

    // The feedback row was deleted between create() and the attach, so the
    // UPDATE matched no row and resolved without error. The just-uploaded public
    // image is reclaimed best-effort and never reaches the GitHub issue, so no
    // orphan outlives a row that could drive its cleanup.
    expect(repository.attachScreenshotUrl).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      screenshotUrl: deliveryUrl,
    });
    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl: deliveryUrl,
    });
    expect(result.screenshotUrl).toBeNull();
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback: expect.objectContaining({ screenshotUrl: null }),
      })
    );
  });

  it("surfaces the orphaned screenshot when the reclaim is unconfirmed after attaching fails", async () => {
    const deliveryUrl = "https://imagedelivery.net/hash/image-1/public";
    const repository = buildRepository({
      attachScreenshotUrl: jest.fn(async () => {
        throw new Error("database_connection_interrupted");
      }),
    });
    const screenshotStorage = buildScreenshotStorage({
      delete: jest.fn(async () => ({ screenshotCleared: false })),
      store: jest.fn(async () => deliveryUrl),
    });
    const logger = buildFeedbackLogger();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      logger,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    // The feedback still ships without a screenshot; the bug report is durable.
    const result = await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(result.screenshotUrl).toBeNull();
    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl: deliveryUrl,
    });
    // The attach failure left screenshot_url null on the row, so there is no
    // persisted delivery URL to drive a later retry. With the reclaim also
    // unconfirmed, surface the orphan with its delivery URL instead of dropping
    // it, so an operator can reclaim the public image.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          feedbackId: FEEDBACK_ID,
          screenshotUrl: deliveryUrl,
        }),
      })
    );
  });

  it("surfaces the orphaned screenshot when the reclaim is unconfirmed after the attach matches no row", async () => {
    const deliveryUrl = "https://imagedelivery.net/hash/image-1/public";
    const repository = buildRepository({
      attachScreenshotUrl: jest.fn(async () => ({ screenshotAttached: false })),
    });
    const screenshotStorage = buildScreenshotStorage({
      delete: jest.fn(async () => ({ screenshotCleared: false })),
      store: jest.fn(async () => deliveryUrl),
    });
    const logger = buildFeedbackLogger();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      logger,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    const result = await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    expect(result.screenshotUrl).toBeNull();
    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl: deliveryUrl,
    });
    // The attach matched no row, so screenshot_url stayed null with no delivery
    // URL persisted; with the reclaim also unconfirmed, the orphan is surfaced
    // instead of dropped so it can be reclaimed manually.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          feedbackId: FEEDBACK_ID,
          screenshotUrl: deliveryUrl,
        }),
      })
    );
  });

  it("does not surface an orphan when the reclaim is confirmed after attaching fails", async () => {
    const deliveryUrl = "https://imagedelivery.net/hash/image-1/public";
    const repository = buildRepository({
      attachScreenshotUrl: jest.fn(async () => {
        throw new Error("database_connection_interrupted");
      }),
    });
    const screenshotStorage = buildScreenshotStorage({
      delete: jest.fn(async () => ({ screenshotCleared: true })),
      store: jest.fn(async () => deliveryUrl),
    });
    const logger = buildFeedbackLogger();
    const useCase = createSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      logger,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      authenticatedMember: buildAuthenticatedMember(),
      command: buildFeedbackCommand(),
      requestUrl: "https://tutribu.example.com/api/siteping",
    });

    // The reclaim confirmed the orphan is gone, so there is nothing to surface.
    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl: deliveryUrl,
    });
    expect(logger.warn).not.toHaveBeenCalled();
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
    expect(screenshotStorage.store).not.toHaveBeenCalled();
    expect(screenshotStorage.delete).not.toHaveBeenCalled();
  });

  it("does not upload a screenshot when the create resolves an idempotency conflict", async () => {
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
      store: jest.fn(async () => "https://imagedelivery.net/hash/image-1/public"),
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

    // The losing race never uploads, so there is no orphan to clean up and the
    // winning feedback keeps its own screenshot.
    expect(screenshotStorage.store).not.toHaveBeenCalled();
    expect(repository.attachScreenshotUrl).not.toHaveBeenCalled();
    expect(screenshotStorage.delete).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("does not upload a screenshot when persisting the feedback throws", async () => {
    const repository = buildRepository({
      create: jest.fn(async () => {
        throw new Error("database_connection_interrupted");
      }),
    });
    const publisher = buildPublisher();
    const screenshotStorage = buildScreenshotStorage({
      store: jest.fn(async () => "https://imagedelivery.net/hash/image-1/public"),
    });
    const useCase = createSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await expect(
      useCase({
        authenticatedMember: buildAuthenticatedMember(),
        command: buildFeedbackCommand(),
        requestUrl: "https://tutribu.example.com/api/siteping",
      })
    ).rejects.toThrow("database_connection_interrupted");

    // create() runs before any upload, so a failed insert leaves no public image
    // to orphan and nothing to delete.
    expect(screenshotStorage.store).not.toHaveBeenCalled();
    expect(screenshotStorage.delete).not.toHaveBeenCalled();
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

  it("uploads and attaches the screenshot only after the durable row is created", async () => {
    const deliveryUrl = "https://imagedelivery.net/hash/image-1/public";
    const repository = buildRepository();
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

    expect(repository.findByIdempotencyKey).toHaveBeenCalledWith({
      clientId: "client-feedback-1",
      createdBy: "member-1",
      projectName: "tutribu",
    });
    expect(screenshotStorage.store).toHaveBeenCalledTimes(1);
    // idempotency check -> create durable row -> upload -> attach URL.
    const findOrder = (repository.findByIdempotencyKey as jest.Mock).mock
      .invocationCallOrder[0];
    const createOrder = (repository.create as jest.Mock).mock
      .invocationCallOrder[0];
    const storeOrder = (screenshotStorage.store as jest.Mock).mock
      .invocationCallOrder[0];
    const attachOrder = (repository.attachScreenshotUrl as jest.Mock).mock
      .invocationCallOrder[0];

    expect(findOrder).toBeLessThan(createOrder);
    expect(createOrder).toBeLessThan(storeOrder);
    expect(storeOrder).toBeLessThan(attachOrder);
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

    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl,
      treatNotFoundAsCleared: true,
    });
    expect(repository.remove).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });
    expect(
      (screenshotStorage.delete as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan((repository.remove as jest.Mock).mock.invocationCallOrder[0]);
  });

  it("clears the screenshot only after confirming the linked GitHub issue close", async () => {
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
        githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.published,
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
    const publisher = buildPublisher();
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });

    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl,
      treatNotFoundAsCleared: true,
    });
    expect(repository.markGitHubIssueDeletionCompleted).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
    });
    // The irreversible screenshot delete runs LAST, only after the issue close is
    // confirmed: hide the row (deletion_pending), close the issue, mark
    // deletion_completed, and only then clear the screenshot before removing the
    // row. Deferring the clear until the close is confirmed means a failed close
    // never destroys the screenshot of an undeleted, still-visible feedback.
    expect(
      (repository.markGitHubIssueDeletionPending as jest.Mock).mock
        .invocationCallOrder[0]
    ).toBeLessThan((publisher.close as jest.Mock).mock.invocationCallOrder[0]);
    expect(
      (publisher.close as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan(
      (repository.markGitHubIssueDeletionCompleted as jest.Mock).mock
        .invocationCallOrder[0]
    );
    expect(
      (repository.markGitHubIssueDeletionCompleted as jest.Mock).mock
        .invocationCallOrder[0]
    ).toBeLessThan(
      (screenshotStorage.delete as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(
      (screenshotStorage.delete as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan((repository.remove as jest.Mock).mock.invocationCallOrder[0]);
  });

  it("never deletes the screenshot when closing the linked GitHub issue fails", async () => {
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
        githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.published,
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
    const publisher = buildPublisher({
      close: jest.fn(async () => {
        throw new Error("github_close_failed");
      }),
    });
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await expect(
      useCase({
        feedbackId: FEEDBACK_ID,
        projectName: "tutribu",
      })
    ).rejects.toThrow("github_close_failed");

    // The close failed (a common, transient GitHub fault), so the irreversible
    // screenshot delete must NOT have run: the still-visible feedback keeps its
    // screenshot intact and its open issue keeps a working image. The row is
    // restored to published so the admin/widget flow can retry the whole delete.
    expect(screenshotStorage.delete).not.toHaveBeenCalled();
    expect(repository.markGitHubIssueDeletionCompleted).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
    expect(repository.restoreGitHubIssuePublished).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
    });
  });

  it("keeps the issue closed and retryable when the screenshot clear fails after closing the issue", async () => {
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
        githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.published,
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
    const screenshotStorage = buildScreenshotStorage({
      delete: jest.fn(async () => ({ screenshotCleared: false })),
    });
    const publisher = buildPublisher();
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await expect(
      useCase({
        feedbackId: FEEDBACK_ID,
        projectName: "tutribu",
      })
    ).rejects.toThrow(/screenshot deletion was not confirmed/i);

    // The close already succeeded, so the issue is closed and the row is marked
    // deletion_completed (hidden by findPage) BEFORE the unconfirmed clear throws.
    // The row is never restored to a visible status, so a closed issue is never
    // paired with a visible row; the deletion_completed branch retries the
    // idempotent clear + remove on a later attempt.
    expect(publisher.close).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      issueNumber: 42,
    });
    expect(repository.markGitHubIssueDeletionCompleted).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
    });
    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl,
      treatNotFoundAsCleared: true,
    });
    expect(repository.remove).not.toHaveBeenCalled();
    expect(repository.restoreGitHubIssuePublished).not.toHaveBeenCalled();
  });

  it("deletes a feedback without a GitHub issue without marking it deletion pending", async () => {
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
        githubIssueNumber: null,
        githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.skipped,
        githubIssueUrl: null,
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
    const publisher = buildPublisher();
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: publisher,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });

    expect(publisher.close).not.toHaveBeenCalled();
    // No GitHub two-phase to checkpoint: hiding the row in deletion_pending only
    // risks stranding it, so the screenshot is cleared while the row is visible
    // and the row is removed without ever being marked pending.
    expect(repository.markGitHubIssueDeletionPending).not.toHaveBeenCalled();
    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl,
      treatNotFoundAsCleared: true,
    });
    expect(repository.remove).toHaveBeenCalledWith({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });
    expect(
      (screenshotStorage.delete as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan((repository.remove as jest.Mock).mock.invocationCallOrder[0]);
  });

  it("keeps a feedback without a GitHub issue visible when the screenshot clear is unconfirmed", async () => {
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
        githubIssueNumber: null,
        githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.skipped,
        githubIssueUrl: null,
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
    const screenshotStorage = buildScreenshotStorage({
      delete: jest.fn(async () => ({ screenshotCleared: false })),
    });
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await expect(
      useCase({
        feedbackId: FEEDBACK_ID,
        projectName: "tutribu",
      })
    ).rejects.toThrow(/screenshot deletion was not confirmed/i);

    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl,
      treatNotFoundAsCleared: true,
    });
    // The clear runs before any status change, so the unconfirmed failure leaves
    // the row in its original, listable status: never marked deletion_pending and
    // never removed, so the normal admin/widget flow can still retry the delete.
    expect(repository.markGitHubIssueDeletionPending).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it("keeps the feedback row when the screenshot deletion is not confirmed", async () => {
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
    const screenshotStorage = buildScreenshotStorage({
      delete: jest.fn(async () => ({ screenshotCleared: false })),
    });
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await expect(
      useCase({
        feedbackId: FEEDBACK_ID,
        projectName: "tutribu",
      })
    ).rejects.toThrow(/screenshot deletion was not confirmed/i);

    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl,
      treatNotFoundAsCleared: true,
    });
    expect(repository.remove).not.toHaveBeenCalled();
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

  it("does not trust a screenshot 404 within the upload race window, keeping the row to retry", async () => {
    const screenshotUrl = "https://imagedelivery.net/hash/reserved-image-1/public";
    const createdAt = new Date("2026-05-31T12:00:00.000Z");
    const repository = buildRepository({
      findById: jest.fn(async () => ({
        annotations: [],
        authorEmail: "leader@example.com",
        authorName: "Leader Example",
        clientId: "client-feedback-1",
        createdAt,
        createdBy: "member-1",
        diagnostics: null,
        githubIssueNumber: null,
        githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.skipped,
        githubIssueUrl: null,
        id: FEEDBACK_ID,
        message: "No puedo guardar el precio",
        projectName: "tutribu",
        resolvedAt: null,
        screenshotUrl,
        status: "open",
        type: SITEPING_FEEDBACK_TYPE.bug,
        updatedAt: createdAt,
        url: "https://tutribu.example.com/matematica/precios",
        urlPattern: "/[slug]/precios",
        userAgent: "Jest Browser",
        viewport: "1280x800",
      })),
    });
    // Faithful port double of the storage adapter's 404 contract: the reserved
    // image returns 404 on DELETE, which only counts as cleared when the caller
    // trusts a 404 as already gone.
    const screenshotStorage = buildScreenshotStorage({
      delete: jest.fn(async (command) => ({
        screenshotCleared: command.treatNotFoundAsCleared === true,
      })),
    });
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      // Deleting one second after creation: the aborted upload's non-idempotent
      // create may still be racing, so a 404 is not yet proof the image is gone.
      now: () => createdAt.getTime() + 1000,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await expect(
      useCase({
        feedbackId: FEEDBACK_ID,
        projectName: "tutribu",
      })
    ).rejects.toThrow(/screenshot deletion was not confirmed/i);

    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl,
      treatNotFoundAsCleared: false,
    });
    // The row survives so a later retry (after the create has certainly resolved)
    // can reclaim a possibly-live orphan instead of removing its only handle.
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it("trusts a screenshot 404 as cleared once the upload race window has elapsed", async () => {
    const screenshotUrl = "https://imagedelivery.net/hash/reserved-image-1/public";
    const createdAt = new Date("2026-05-31T12:00:00.000Z");
    const repository = buildRepository({
      findById: jest.fn(async () => ({
        annotations: [],
        authorEmail: "leader@example.com",
        authorName: "Leader Example",
        clientId: "client-feedback-1",
        createdAt,
        createdBy: "member-1",
        diagnostics: null,
        githubIssueNumber: null,
        githubIssueStatus: SITEPING_FEEDBACK_GITHUB_STATUS.skipped,
        githubIssueUrl: null,
        id: FEEDBACK_ID,
        message: "No puedo guardar el precio",
        projectName: "tutribu",
        resolvedAt: null,
        screenshotUrl,
        status: "open",
        type: SITEPING_FEEDBACK_TYPE.bug,
        updatedAt: createdAt,
        url: "https://tutribu.example.com/matematica/precios",
        urlPattern: "/[slug]/precios",
        userAgent: "Jest Browser",
        viewport: "1280x800",
      })),
    });
    const screenshotStorage = buildScreenshotStorage({
      delete: jest.fn(async (command) => ({
        screenshotCleared: command.treatNotFoundAsCleared === true,
      })),
    });
    const useCase = deleteSitepingFeedback({
      githubIssuePublisher: buildPublisher(),
      // Deleting after the race window has fully elapsed: the create has certainly
      // resolved, so a 404 is now proof the image is gone and the row is removable.
      now: () =>
        createdAt.getTime() + SITEPING_SCREENSHOT_UPLOAD_RACE_WINDOW_MS,
      screenshotStorage,
      sitepingFeedbackRepository: repository,
    });

    await useCase({
      feedbackId: FEEDBACK_ID,
      projectName: "tutribu",
    });

    expect(screenshotStorage.delete).toHaveBeenCalledWith({
      screenshotUrl,
      treatNotFoundAsCleared: true,
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
