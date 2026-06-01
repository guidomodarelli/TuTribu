import { PostgresSitepingFeedbackRepository } from "@/src/modules/siteping/infrastructure/repositories/postgres-siteping-feedback-repository";
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
  screenshot_url: null;
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
  insertFeedback: "insertFeedback",
  selectAnnotations: "selectAnnotations",
  selectFeedback: "selectFeedback",
  unsupported: "unsupported",
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
  if (sql.includes("insert into public.siteping_feedbacks")) {
    return SQL_OPERATION.insertFeedback;
  }

  if (sql.includes("from public.siteping_annotations")) {
    return SQL_OPERATION.selectAnnotations;
  }

  if (sql.includes("from public.siteping_feedbacks")) {
    return SQL_OPERATION.selectFeedback;
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
      if (query.params.length === 1) {
        const [feedbackId] = query.params;

        return {
          rows: feedbackRows.filter(
            (feedbackRow) => feedbackRow.id === feedbackId
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

    await expect(repository.findById(feedbackRows[0].id)).resolves.toMatchObject({
      githubIssueNumber: 42,
      githubIssueUrl: "https://github.com/guidomodarelli/LaTribu/issues/42",
      id: feedbackRows[0].id,
    });
  });
});
