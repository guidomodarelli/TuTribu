import { PostgresSitepingFeedbackRepository } from "@/src/modules/siteping/infrastructure/repositories/postgres-siteping-feedback-repository";
import { SITEPING_FEEDBACK_GITHUB_STATUS } from "@/src/modules/siteping/constants/siteping";
import type { CreateSitepingFeedbackRecordCommand } from "@/src/modules/siteping/domain/repositories/siteping-feedback-repository";

type QueryConfig = {
  casing: { getColumnCasing: (column: { name: string }) => string };
  escapeName: (name: string) => string;
  escapeParam: (index: number) => string;
  escapeString: (value: string) => string;
};

type QueryStatement = {
  toQuery: (config: QueryConfig) => { params: unknown[]; sql: string };
};

type FeedbackRow = {
  author_email: string;
  author_name: string;
  client_id: string;
  created_at: Date;
  created_by: string;
  diagnostics: null;
  github_issue_number: null;
  github_issue_status: string;
  github_issue_url: null;
  id: string;
  message: string;
  project_name: string;
  resolved_at: null;
  screenshot_url: string | null;
  status: string;
  type: string;
  updated_at: Date;
  url: string;
  url_pattern: null;
  user_agent: string;
  viewport: string;
};

const QUERY_CONFIG: QueryConfig = {
  casing: { getColumnCasing: (column) => column.name },
  escapeName: (name) => `"${name}"`,
  escapeParam: (index) => `$${index + 1}`,
  escapeString: (value) => `'${value.replaceAll("'", "''")}'`,
};

const SQL_OPERATION = {
  deleteFeedback: "deleteFeedback",
  insertFeedback: "insertFeedback",
  selectAnnotations: "selectAnnotations",
  selectFeedback: "selectFeedback",
  unsupported: "unsupported",
  updateFeedback: "updateFeedback",
} as const;

const POSTGRES_TEST_ERROR = {
  transactionAborted: "25P02",
  uniqueViolation: "23505",
} as const;

type RepositoryHarnessOptions = {
  beforeFeedbackInsert?: (
    command: CreateSitepingFeedbackRecordCommand,
    feedbackRows: FeedbackRow[]
  ) => void;
};

function createFeedbackCommand(
  override: Partial<CreateSitepingFeedbackRecordCommand> = {}
): CreateSitepingFeedbackRecordCommand {
  return {
    annotations: [],
    authorEmail: "grace@example.com",
    authorName: "Grace Hopper",
    clientId: "client-feedback-1",
    createdBy: "member-1",
    diagnostics: null,
    message: "El boton no responde",
    projectName: "tutribu",
    screenshotUrl: null,
    type: "bug",
    url: "https://tutribu.example.com/matematica/precios",
    urlPattern: null,
    userAgent: "Mozilla/5.0",
    viewport: "1440x900",
    ...override,
  };
}

function readQuery(statement: unknown): { params: unknown[]; sql: string } {
  return (statement as QueryStatement).toQuery(QUERY_CONFIG);
}

function getSqlOperation(sql: string): (typeof SQL_OPERATION)[keyof typeof SQL_OPERATION] {
  if (sql.includes("delete from public.siteping_feedbacks")) {
    return SQL_OPERATION.deleteFeedback;
  }

  if (sql.includes("insert into public.siteping_feedbacks")) {
    return SQL_OPERATION.insertFeedback;
  }

  if (sql.includes("from public.siteping_annotations")) {
    return SQL_OPERATION.selectAnnotations;
  }

  if (sql.includes("from public.siteping_feedbacks")) {
    return SQL_OPERATION.selectFeedback;
  }

  if (sql.includes("update public.siteping_feedbacks")) {
    return SQL_OPERATION.updateFeedback;
  }

  return SQL_OPERATION.unsupported;
}

function createFeedbackRow(command: CreateSitepingFeedbackRecordCommand): FeedbackRow {
  const createdAt = new Date("2026-05-31T12:00:00.000Z");

  return {
    author_email: command.authorEmail,
    author_name: command.authorName,
    client_id: command.clientId,
    created_at: createdAt,
    created_by: command.createdBy,
    diagnostics: null,
    github_issue_number: null,
    github_issue_status: "pending",
    github_issue_url: null,
    id: `feedback-${command.projectName}-${command.createdBy}`,
    message: command.message,
    project_name: command.projectName,
    resolved_at: null,
    screenshot_url: null,
    status: "open",
    type: command.type,
    updated_at: createdAt,
    url: command.url,
    url_pattern: null,
    user_agent: command.userAgent,
    viewport: command.viewport,
  };
}

function createRepositoryHarness(options: RepositoryHarnessOptions = {}) {
  const feedbackRows: FeedbackRow[] = [];
  let isTransactionAborted = false;
  const execute = jest.fn(async (statement: unknown) => {
    const query = readQuery(statement);
    const operation = getSqlOperation(query.sql);

    if (isTransactionAborted) {
      throw Object.assign(new Error("current transaction is aborted"), {
        code: POSTGRES_TEST_ERROR.transactionAborted,
      });
    }

    if (operation === SQL_OPERATION.selectFeedback) {
      if (query.sql.includes("order by created_at desc")) {
        return {
          rows: feedbackRows.filter(
            (feedbackRow) =>
              feedbackRow.project_name === query.params[0] &&
              feedbackRow.github_issue_status !==
                SITEPING_FEEDBACK_GITHUB_STATUS.deletionPending &&
              feedbackRow.github_issue_status !==
                SITEPING_FEEDBACK_GITHUB_STATUS.deletionCompleted
          ),
        };
      }

      if (query.sql.includes("select count(*)::int as total")) {
        return {
          rows: [
            {
              total: feedbackRows.filter(
                (feedbackRow) =>
                  feedbackRow.project_name === query.params[0] &&
                  feedbackRow.github_issue_status !==
                    SITEPING_FEEDBACK_GITHUB_STATUS.deletionPending &&
                  feedbackRow.github_issue_status !==
                    SITEPING_FEEDBACK_GITHUB_STATUS.deletionCompleted
              ).length,
            },
          ],
        };
      }

      if (query.params.length === 2) {
        const [feedbackId, projectName] = query.params;

        return {
          rows: feedbackRows.filter(
            (feedbackRow) =>
              feedbackRow.id === feedbackId &&
              feedbackRow.project_name === projectName
          ),
        };
      }

      const [projectName, createdBy, clientId] = query.params;

      return {
        rows: feedbackRows.filter(
          (feedbackRow) =>
            feedbackRow.project_name === projectName &&
            feedbackRow.created_by === createdBy &&
            feedbackRow.client_id === clientId
        ),
      };
    }

    if (operation === SQL_OPERATION.insertFeedback) {
      const command = createFeedbackCommand({
        projectName: query.params[0] as string,
        type: query.params[1] as CreateSitepingFeedbackRecordCommand["type"],
        message: query.params[2] as string,
        url: query.params[4] as string,
        urlPattern: query.params[5] as string | null,
        viewport: query.params[6] as string,
        userAgent: query.params[7] as string,
        authorName: query.params[8] as string,
        authorEmail: query.params[9] as string,
        clientId: query.params[10] as string,
        createdBy: query.params[11] as string,
      });
      options.beforeFeedbackInsert?.(command, feedbackRows);
      const existingFeedbackRow = feedbackRows.find(
        (feedbackRow) =>
          feedbackRow.project_name === command.projectName &&
          feedbackRow.created_by === command.createdBy &&
          feedbackRow.client_id === command.clientId
      );

      if (existingFeedbackRow) {
        if (!query.sql.includes("on conflict")) {
          isTransactionAborted = true;

          throw Object.assign(new Error("duplicate key value"), {
            code: POSTGRES_TEST_ERROR.uniqueViolation,
          });
        }

        return { rows: [] };
      }

      const feedbackRow = createFeedbackRow(command);

      feedbackRows.push(feedbackRow);

      return { rows: [feedbackRow] };
    }

    if (operation === SQL_OPERATION.selectAnnotations) {
      return { rows: [] };
    }

    if (operation === SQL_OPERATION.updateFeedback) {
      if (query.sql.includes("screenshot_url")) {
        const [screenshotUrl, feedbackId] = query.params;
        const feedbackRow = feedbackRows.find((row) => row.id === feedbackId);

        if (feedbackRow) {
          feedbackRow.screenshot_url = screenshotUrl as string;
        }

        return { rows: feedbackRow ? [feedbackRow] : [] };
      }

      if (query.sql.includes("github_issue_status")) {
        const projectName = query.sql.includes("project_name")
          ? query.params.at(-1)
          : undefined;
        const feedbackId = query.sql.includes("project_name")
          ? query.params.at(-2)
          : query.params.at(-1);
        const feedbackRowsToUpdate = feedbackRows.filter(
          (row) =>
            row.id === feedbackId &&
            (projectName === undefined || row.project_name === projectName)
        );

        feedbackRowsToUpdate.forEach((feedbackRow) => {
          feedbackRow.github_issue_status = query.params[0] as string;
        });

        return { rows: feedbackRowsToUpdate };
      }

      const [status, resolvedAt, feedbackId, projectName] = query.params;
      const feedbackRow = feedbackRows.find(
        (row) => row.id === feedbackId && row.project_name === projectName
      );

      if (!feedbackRow) {
        return { rows: [] };
      }

      feedbackRow.status = status as string;
      feedbackRow.resolved_at = resolvedAt as null;

      return { rows: [feedbackRow] };
    }

    if (operation === SQL_OPERATION.deleteFeedback) {
      const [feedbackId, projectName] = query.params;
      const feedbackIndex = feedbackRows.findIndex(
        (feedbackRow) =>
          feedbackRow.id === feedbackId && feedbackRow.project_name === projectName
      );

      if (feedbackIndex >= 0) {
        feedbackRows.splice(feedbackIndex, 1);
      }

      return { rows: [] };
    }

    throw new Error(`Unsupported SitePing repository query: ${query.sql}`);
  });
  const repository = new PostgresSitepingFeedbackRepository(async (callback) =>
    callback({ execute } as never)
  );

  return { feedbackRows, repository };
}

describe("PostgresSitepingFeedbackRepository", () => {
  it("scopes create idempotency to project, owner, and client id", async () => {
    const { feedbackRows, repository } = createRepositoryHarness();
    const firstCommand = createFeedbackCommand();
    const secondOwnerCommand = createFeedbackCommand({
      authorEmail: "ada@example.com",
      authorName: "Ada Lovelace",
      createdBy: "member-2",
    });
    const secondProjectCommand = createFeedbackCommand({
      projectName: "another-project",
    });

    await expect(repository.create(firstCommand)).resolves.toMatchObject({
      feedback: {
        clientId: "client-feedback-1",
        createdBy: "member-1",
        projectName: "tutribu",
      },
      wasCreated: true,
    });
    await expect(repository.create(firstCommand)).resolves.toMatchObject({
      feedback: {
        clientId: "client-feedback-1",
        createdBy: "member-1",
        projectName: "tutribu",
      },
      wasCreated: false,
    });
    await expect(repository.create(secondOwnerCommand)).resolves.toMatchObject({
      feedback: {
        clientId: "client-feedback-1",
        createdBy: "member-2",
        projectName: "tutribu",
      },
      wasCreated: true,
    });
    await expect(repository.create(secondProjectCommand)).resolves.toMatchObject({
      feedback: {
        clientId: "client-feedback-1",
        createdBy: "member-1",
        projectName: "another-project",
      },
      wasCreated: true,
    });

    expect(feedbackRows).toHaveLength(3);
  });

  it("attaches an uploaded screenshot URL to an existing feedback row", async () => {
    const { feedbackRows, repository } = createRepositoryHarness();
    const screenshotUrl = "https://imagedelivery.net/hash/image-1/public";

    await repository.create(createFeedbackCommand());
    expect(feedbackRows[0].screenshot_url).toBeNull();

    await expect(
      repository.attachScreenshotUrl({
        feedbackId: feedbackRows[0].id,
        screenshotUrl,
      })
    ).resolves.toEqual({ screenshotAttached: true });

    expect(feedbackRows[0].screenshot_url).toBe(screenshotUrl);
  });

  it("reports no attachment when the feedback row no longer exists", async () => {
    const { feedbackRows, repository } = createRepositoryHarness();

    await repository.create(createFeedbackCommand());
    const feedbackId = feedbackRows[0].id;
    // A concurrent delete between create() and the attach leaves no row for the
    // screenshot UPDATE to match, so it must report the link did not persist.
    await repository.remove({ feedbackId, projectName: "tutribu" });

    await expect(
      repository.attachScreenshotUrl({
        feedbackId,
        screenshotUrl: "https://imagedelivery.net/hash/image-1/public",
      })
    ).resolves.toEqual({ screenshotAttached: false });
  });

  it("finds existing feedback by its idempotency key scoped to project and owner", async () => {
    const { repository } = createRepositoryHarness();

    await repository.create(createFeedbackCommand());

    await expect(repository.findByIdempotencyKey({
      clientId: "client-feedback-1",
      createdBy: "member-1",
      projectName: "tutribu",
    })).resolves.toMatchObject({
      clientId: "client-feedback-1",
      createdBy: "member-1",
      projectName: "tutribu",
    });

    await expect(repository.findByIdempotencyKey({
      clientId: "client-feedback-1",
      createdBy: "member-1",
      projectName: "another-project",
    })).resolves.toBeNull();

    await expect(repository.findByIdempotencyKey({
      clientId: "client-feedback-2",
      createdBy: "member-1",
      projectName: "tutribu",
    })).resolves.toBeNull();
  });

  it("returns the concurrent duplicate feedback without aborting the transaction", async () => {
    const { feedbackRows, repository } = createRepositoryHarness({
      beforeFeedbackInsert: (command, rows) => {
        if (rows.length === 0) {
          rows.push(createFeedbackRow(command));
        }
      },
    });

    await expect(repository.create(createFeedbackCommand())).resolves.toMatchObject({
      feedback: {
        clientId: "client-feedback-1",
        createdBy: "member-1",
        projectName: "tutribu",
      },
      wasCreated: false,
    });

    expect(feedbackRows).toHaveLength(1);
  });

  it("finds feedback by id with GitHub issue metadata", async () => {
    const { feedbackRows, repository } = createRepositoryHarness();

    await repository.create(createFeedbackCommand());
    feedbackRows[0].github_issue_number = 42;
    feedbackRows[0].github_issue_url =
      "https://github.com/guidomodarelli/LaTribu/issues/42";

    await expect(repository.findById({
      feedbackId: feedbackRows[0].id,
      projectName: "tutribu",
    })).resolves.toMatchObject({
      githubIssueNumber: 42,
      githubIssueUrl: "https://github.com/guidomodarelli/LaTribu/issues/42",
      id: feedbackRows[0].id,
    });
  });

  it("does not find feedback from another Siteping project", async () => {
    const { feedbackRows, repository } = createRepositoryHarness();

    await repository.create(createFeedbackCommand());

    await expect(repository.findById({
      feedbackId: feedbackRows[0].id,
      projectName: "another-project",
    })).resolves.toBeNull();
  });

  it("updates feedback status only inside the requested Siteping project", async () => {
    const { feedbackRows, repository } = createRepositoryHarness();

    await repository.create(createFeedbackCommand());

    await expect(repository.updateStatus({
      feedbackId: feedbackRows[0].id,
      projectName: "another-project",
      status: "resolved",
    })).resolves.toBeNull();
    expect(feedbackRows[0].status).toBe("open");

    await expect(repository.updateStatus({
      feedbackId: feedbackRows[0].id,
      projectName: "tutribu",
      status: "resolved",
    })).resolves.toMatchObject({
      projectName: "tutribu",
      status: "resolved",
    });
  });

  it("hides feedback marked for deletion from paginated lists", async () => {
    const { feedbackRows, repository } = createRepositoryHarness();

    await repository.create(createFeedbackCommand());
    await repository.create(createFeedbackCommand({
      clientId: "client-feedback-2",
    }));
    feedbackRows[1].github_issue_status =
      SITEPING_FEEDBACK_GITHUB_STATUS.deletionPending;

    await expect(repository.findPage({
      projectName: "tutribu",
    })).resolves.toMatchObject({
      feedbacks: [
        {
          clientId: "client-feedback-1",
        },
      ],
      total: 1,
    });
  });

  it("persists durable GitHub deletion states", async () => {
    const { feedbackRows, repository } = createRepositoryHarness();

    await repository.create(createFeedbackCommand());
    await repository.markGitHubIssueDeletionPending({
      feedbackId: feedbackRows[0].id,
      projectName: "tutribu",
    });

    expect(feedbackRows[0].github_issue_status).toBe(
      SITEPING_FEEDBACK_GITHUB_STATUS.deletionPending
    );

    await repository.markGitHubIssueDeletionCompleted({
      feedbackId: feedbackRows[0].id,
    });

    expect(feedbackRows[0].github_issue_status).toBe(
      SITEPING_FEEDBACK_GITHUB_STATUS.deletionCompleted
    );

    await repository.restoreGitHubIssuePublished({
      feedbackId: feedbackRows[0].id,
    });

    expect(feedbackRows[0].github_issue_status).toBe(
      SITEPING_FEEDBACK_GITHUB_STATUS.published
    );
  });

  it("removes feedback only inside the requested Siteping project", async () => {
    const { feedbackRows, repository } = createRepositoryHarness();

    await repository.create(createFeedbackCommand());
    await repository.remove({
      feedbackId: feedbackRows[0].id,
      projectName: "another-project",
    });

    expect(feedbackRows).toHaveLength(1);

    await repository.remove({
      feedbackId: feedbackRows[0].id,
      projectName: "tutribu",
    });

    expect(feedbackRows).toHaveLength(0);
  });
});
