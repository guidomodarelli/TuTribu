import { sql } from "drizzle-orm";

import {
  SITEPING_FEEDBACK_GITHUB_STATUS,
  SITEPING_FEEDBACK_STATUS,
} from "@/src/modules/siteping/constants/siteping";
import type {
  CreateSitepingFeedbackRecordCommand,
  CreateSitepingFeedbackRecordResult,
  MarkGitHubIssueFailedCommand,
  MarkGitHubIssuePublishedCommand,
  SitepingAnnotation,
  SitepingFeedback,
  SitepingFeedbackPage,
  SitepingFeedbackProjectCommand,
  SitepingFeedbackQuery,
  SitepingFeedbackRepository,
  UpdateSitepingFeedbackStatusCommand,
} from "@/src/modules/siteping/domain/repositories/siteping-feedback-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type ExecuteWithRequestContext = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type FeedbackRow = {
  author_email: string;
  author_name: string;
  client_id: string;
  created_at: Date;
  created_by: string;
  diagnostics: SitepingFeedback["diagnostics"];
  github_issue_number: number | null;
  github_issue_status: SitepingFeedback["githubIssueStatus"];
  github_issue_url: string | null;
  id: string;
  message: string;
  project_name: string;
  resolved_at: Date | null;
  screenshot_url: string | null;
  status: SitepingFeedback["status"];
  type: SitepingFeedback["type"];
  updated_at: Date;
  url: string;
  url_pattern: string | null;
  user_agent: string;
  viewport: string;
};

type AnnotationRow = {
  anchor_key: string | null;
  created_at: Date;
  css_selector: string;
  device_pixel_ratio: number | string;
  element_id: string | null;
  element_tag: string;
  feedback_id: string;
  fingerprint: string;
  h_pct: number | string;
  id: string;
  neighbor_text: string;
  scroll_x: number | string;
  scroll_y: number | string;
  text_prefix: string;
  text_snippet: string;
  text_suffix: string;
  viewport_h: number;
  viewport_w: number;
  w_pct: number | string;
  xpath: string;
  x_pct: number | string;
  y_pct: number | string;
};

type SitepingIdempotencyKey = {
  clientId: string;
  createdBy: string;
  projectName: string;
};

const SITEPING_PAGINATION = {
  defaultLimit: 50,
  defaultPage: 1,
  maxLimit: 100,
} as const;

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function mapAnnotationRow(row: AnnotationRow): SitepingAnnotation {
  return {
    anchorKey: row.anchor_key,
    createdAt: row.created_at,
    cssSelector: row.css_selector,
    devicePixelRatio: toNumber(row.device_pixel_ratio),
    elementId: row.element_id,
    elementTag: row.element_tag,
    feedbackId: row.feedback_id,
    fingerprint: row.fingerprint,
    hPct: toNumber(row.h_pct),
    id: row.id,
    neighborText: row.neighbor_text,
    scrollX: toNumber(row.scroll_x),
    scrollY: toNumber(row.scroll_y),
    textPrefix: row.text_prefix,
    textSnippet: row.text_snippet,
    textSuffix: row.text_suffix,
    viewportH: row.viewport_h,
    viewportW: row.viewport_w,
    wPct: toNumber(row.w_pct),
    xpath: row.xpath,
    xPct: toNumber(row.x_pct),
    yPct: toNumber(row.y_pct),
  };
}

function mapFeedbackRow(
  row: FeedbackRow,
  annotations: SitepingAnnotation[] = []
): SitepingFeedback {
  return {
    annotations,
    authorEmail: row.author_email,
    authorName: row.author_name,
    clientId: row.client_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    diagnostics: row.diagnostics,
    githubIssueNumber: row.github_issue_number,
    githubIssueStatus: row.github_issue_status,
    githubIssueUrl: row.github_issue_url,
    id: row.id,
    message: row.message,
    projectName: row.project_name,
    resolvedAt: row.resolved_at,
    screenshotUrl: row.screenshot_url,
    status: row.status,
    type: row.type,
    updatedAt: row.updated_at,
    url: row.url,
    urlPattern: row.url_pattern,
    userAgent: row.user_agent,
    viewport: row.viewport,
  };
}

function normalizeLimit(limit?: number): number {
  if (!limit || limit < SITEPING_PAGINATION.defaultPage) {
    return SITEPING_PAGINATION.defaultLimit;
  }

  return Math.min(limit, SITEPING_PAGINATION.maxLimit);
}

function normalizePage(page?: number): number {
  if (!page || page < SITEPING_PAGINATION.defaultPage) {
    return SITEPING_PAGINATION.defaultPage;
  }

  return page;
}

export class PostgresSitepingFeedbackRepository
  implements SitepingFeedbackRepository
{
  constructor(private readonly executeWithRequestContext: ExecuteWithRequestContext) {}

  /**
   * Creates SitePing feedback or returns the existing idempotent submission.
   *
   * @param command - Feedback payload and idempotency identifiers for the current user.
   * @returns The persisted feedback and whether this call created it.
   * @throws When the created or existing feedback cannot be loaded from Postgres.
   */
  async create(
    command: CreateSitepingFeedbackRecordCommand
  ): Promise<CreateSitepingFeedbackRecordResult> {
    return this.executeWithRequestContext(async (database) => {
      const idempotencyKey = {
        clientId: command.clientId,
        createdBy: command.createdBy,
        projectName: command.projectName,
      };
      const existingFeedback = await this.findByIdempotencyKey(
        database,
        idempotencyKey
      );

      if (existingFeedback) {
        return {
          feedback: existingFeedback,
          wasCreated: false,
        };
      }

      const feedbackRows = await database.execute(sql`
        insert into public.siteping_feedbacks (
          project_name,
          type,
          message,
          status,
          url,
          url_pattern,
          viewport,
          user_agent,
          author_name,
          author_email,
          client_id,
          created_by,
          screenshot_url,
          diagnostics,
          github_issue_status
        )
        values (
          ${command.projectName},
          ${command.type},
          ${command.message},
          ${SITEPING_FEEDBACK_STATUS.open},
          ${command.url},
          ${command.urlPattern},
          ${command.viewport},
          ${command.userAgent},
          ${command.authorName},
          ${command.authorEmail},
          ${command.clientId},
          ${command.createdBy},
          ${command.screenshotUrl},
          ${JSON.stringify(command.diagnostics)}::jsonb,
          ${SITEPING_FEEDBACK_GITHUB_STATUS.pending}
        )
        on conflict (project_name, created_by, client_id) do nothing
        returning *
      `);
      const [feedbackRow] = feedbackRows.rows as FeedbackRow[];

      if (!feedbackRow) {
        const feedback = await this.findByIdempotencyKey(database, idempotencyKey);

        if (feedback) {
          return {
            feedback,
            wasCreated: false,
          };
        }

        throw new Error("Siteping feedback could not be loaded after conflict.");
      }

      if (command.annotations.length > 0) {
        await Promise.all(
          command.annotations.map((annotation) =>
            database.execute(sql`
              insert into public.siteping_annotations (
                feedback_id,
                css_selector,
                xpath,
                text_snippet,
                element_tag,
                element_id,
                text_prefix,
                text_suffix,
                fingerprint,
                neighbor_text,
                anchor_key,
                x_pct,
                y_pct,
                w_pct,
                h_pct,
                scroll_x,
                scroll_y,
                viewport_w,
                viewport_h,
                device_pixel_ratio
              )
              values (
                ${feedbackRow.id},
                ${annotation.cssSelector},
                ${annotation.xpath},
                ${annotation.textSnippet},
                ${annotation.elementTag},
                ${annotation.elementId},
                ${annotation.textPrefix},
                ${annotation.textSuffix},
                ${annotation.fingerprint},
                ${annotation.neighborText},
                ${annotation.anchorKey},
                ${annotation.xPct},
                ${annotation.yPct},
                ${annotation.wPct},
                ${annotation.hPct},
                ${annotation.scrollX},
                ${annotation.scrollY},
                ${annotation.viewportW},
                ${annotation.viewportH},
                ${annotation.devicePixelRatio}
              )
            `)
          )
        );
      }

      const feedback = await this.findByIdempotencyKey(database, idempotencyKey);

      if (!feedback) {
        throw new Error("Siteping feedback could not be loaded after insert.");
      }

      return {
        feedback,
        wasCreated: true,
      };
    });
  }

  async findById({
    feedbackId,
    projectName,
  }: SitepingFeedbackProjectCommand): Promise<SitepingFeedback | null> {
    return this.executeWithRequestContext(async (database) => {
      const rows = await database.execute(sql`
        select *
        from public.siteping_feedbacks
        where id = ${feedbackId}
          and project_name = ${projectName}
        limit 1
      `);
      const [feedbackRow] = rows.rows as FeedbackRow[];

      if (!feedbackRow) {
        return null;
      }

      return mapFeedbackRow(
        feedbackRow,
        await this.findAnnotationsByFeedbackId(database, feedbackRow.id)
      );
    });
  }

  async findPage(query: SitepingFeedbackQuery): Promise<SitepingFeedbackPage> {
    return this.executeWithRequestContext(async (database) => {
      const limit = normalizeLimit(query.limit);
      const offset = (normalizePage(query.page) - SITEPING_PAGINATION.defaultPage) * limit;
      const rows = await database.execute(sql`
        select *
        from public.siteping_feedbacks
        where project_name = ${query.projectName}
          and (${query.type ?? null}::text is null or type = ${query.type ?? null})
          and (${query.status ?? null}::text is null or status = ${query.status ?? null})
          and (${query.url ?? null}::text is null or url = ${query.url ?? null})
          and (${query.urlPattern ?? null}::text is null or url_pattern = ${query.urlPattern ?? null})
          and (${query.search ?? null}::text is null or message ilike '%' || ${query.search ?? null} || '%')
        order by created_at desc
        limit ${limit}
        offset ${offset}
      `);
      const countRows = await database.execute(sql`
        select count(*)::int as total
        from public.siteping_feedbacks
        where project_name = ${query.projectName}
          and (${query.type ?? null}::text is null or type = ${query.type ?? null})
          and (${query.status ?? null}::text is null or status = ${query.status ?? null})
          and (${query.url ?? null}::text is null or url = ${query.url ?? null})
          and (${query.urlPattern ?? null}::text is null or url_pattern = ${query.urlPattern ?? null})
          and (${query.search ?? null}::text is null or message ilike '%' || ${query.search ?? null} || '%')
      `);
      const feedbackRows = rows.rows as FeedbackRow[];
      const feedbacks = await Promise.all(
        feedbackRows.map(async (feedbackRow) =>
          mapFeedbackRow(
            feedbackRow,
            await this.findAnnotationsByFeedbackId(database, feedbackRow.id)
          )
        )
      );

      return {
        feedbacks,
        total: Number((countRows.rows[0] as { total?: number } | undefined)?.total ?? 0),
      };
    });
  }

  async markGitHubIssueFailed({
    errorMessage,
    feedbackId,
  }: MarkGitHubIssueFailedCommand): Promise<void> {
    await this.executeWithRequestContext(async (database) => {
      await database.execute(sql`
        update public.siteping_feedbacks
        set github_issue_status = ${SITEPING_FEEDBACK_GITHUB_STATUS.failed},
            github_issue_error = ${errorMessage},
            updated_at = timezone('utc', now())
        where id = ${feedbackId}
      `);
    });
  }

  async markGitHubIssuePublished({
    feedbackId,
    issueNumber,
    issueUrl,
  }: MarkGitHubIssuePublishedCommand): Promise<void> {
    await this.executeWithRequestContext(async (database) => {
      await database.execute(sql`
        update public.siteping_feedbacks
        set github_issue_status = ${SITEPING_FEEDBACK_GITHUB_STATUS.published},
            github_issue_number = ${issueNumber},
            github_issue_url = ${issueUrl},
            github_issue_error = null,
            updated_at = timezone('utc', now())
        where id = ${feedbackId}
      `);
    });
  }

  async remove({
    feedbackId,
    projectName,
  }: SitepingFeedbackProjectCommand): Promise<void> {
    await this.executeWithRequestContext(async (database) => {
      await database.execute(sql`
        delete from public.siteping_feedbacks
        where id = ${feedbackId}
          and project_name = ${projectName}
      `);
    });
  }

  async removeAll(projectName: string): Promise<void> {
    await this.executeWithRequestContext(async (database) => {
      await database.execute(sql`
        delete from public.siteping_feedbacks
        where project_name = ${projectName}
      `);
    });
  }

  async updateStatus({
    feedbackId,
    projectName,
    status,
  }: UpdateSitepingFeedbackStatusCommand): Promise<SitepingFeedback> {
    return this.executeWithRequestContext(async (database) => {
      const resolvedAt = status === SITEPING_FEEDBACK_STATUS.resolved ? new Date() : null;
      const rows = await database.execute(sql`
        update public.siteping_feedbacks
        set status = ${status},
            resolved_at = ${resolvedAt},
            updated_at = timezone('utc', now())
        where id = ${feedbackId}
          and project_name = ${projectName}
        returning *
      `);
      const [feedbackRow] = rows.rows as FeedbackRow[];

      if (!feedbackRow) {
        throw new Error("Siteping feedback was not found for status update.");
      }

      return mapFeedbackRow(
        feedbackRow,
        await this.findAnnotationsByFeedbackId(database, feedbackRow.id)
      );
    });
  }

  private async findByIdempotencyKey(
    database: RequestDatabase,
    idempotencyKey: SitepingIdempotencyKey
  ): Promise<SitepingFeedback | null> {
    const rows = await database.execute(sql`
      select *
      from public.siteping_feedbacks
      where project_name = ${idempotencyKey.projectName}
        and created_by = ${idempotencyKey.createdBy}
        and client_id = ${idempotencyKey.clientId}
      limit 1
    `);
    const [feedbackRow] = rows.rows as FeedbackRow[];

    if (!feedbackRow) {
      return null;
    }

    return mapFeedbackRow(
      feedbackRow,
      await this.findAnnotationsByFeedbackId(database, feedbackRow.id)
    );
  }

  private async findAnnotationsByFeedbackId(
    database: RequestDatabase,
    feedbackId: string
  ): Promise<SitepingAnnotation[]> {
    const rows = await database.execute(sql`
      select *
      from public.siteping_annotations
      where feedback_id = ${feedbackId}
      order by created_at asc
    `);

    return (rows.rows as AnnotationRow[]).map(mapAnnotationRow);
  }
}
