/**
 * Route handlers shared by the lesson and message attachments: direct-upload
 * reservation, authorized download redirect and deletion. Each route brings
 * its copy, log wiring and module use case; the session check, the status to
 * HTTP mapping and the logged 500 live here.
 *
 * @module attachment-file-routes
 */

import {
  createRouteJsonResponse,
  createStatusMessageResponse,
  handleMemberRoute,
  type OpenMemberRouteScope,
  type RequestModules,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const ATTACHMENT_UPLOAD_ROUTE_FIELD = {
  fileName: "fileName",
  fileSizeBytes: "fileSizeBytes",
  mimeType: "mimeType",
} as const;

const ATTACHMENT_STATUS = {
  created: "created",
  deleted: "deleted",
  forbidden: "forbidden",
  invalidFile: "invalid_file",
  notFound: "not_found",
} as const;

/** Log wiring of an attachment route. */
export type AttachmentRouteLog = {
  failureMessage: string;
  feature: string;
  operation: string;
};

/** Copy every attachment route answers with outside its use case. */
type AttachmentRouteSessionCopy = {
  unauthorizedMessage: string;
  unexpectedMessage: string;
};

type AttachmentRouteContext<TParams> = { params: Promise<TParams> };

type TribeRouteParams = { slug: string };

export type AttachmentUploadDeclaration = {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
};

export type AttachmentUploadResult =
  | {
      assetId: string;
      status: typeof ATTACHMENT_STATUS.created;
      uploadHeaders: Record<string, string>;
      uploadUrl: string;
    }
  | {
      status:
        | typeof ATTACHMENT_STATUS.forbidden
        | typeof ATTACHMENT_STATUS.notFound
        | typeof ATTACHMENT_STATUS.invalidFile;
    };

/** Spanish copy of an attachment upload route. */
export type AttachmentUploadRouteCopy = AttachmentRouteSessionCopy & {
  forbiddenMessage: string;
  invalidFileMessage: string;
  notFoundMessage: string;
};

export type AttachmentDownloadResult =
  | { downloadUrl: string; status: typeof ATTACHMENT_STATUS.created }
  | {
      status:
        | typeof ATTACHMENT_STATUS.invalidFile
        | typeof ATTACHMENT_STATUS.notFound;
    };

/** Spanish copy of an attachment download route. */
export type AttachmentDownloadRouteCopy = AttachmentRouteSessionCopy & {
  invalidFileMessage: string;
  notFoundMessage: string;
};

/** Spanish copy of an attachment deletion route. */
export type AttachmentDeletionRouteCopy = AttachmentRouteSessionCopy & {
  forbiddenMessage: string;
  notFoundMessage: string;
  successMessage: string;
};

/**
 * Builds an attachment route handler that awaits the route params and runs
 * its body inside the member scope: 401 without a session, and a thrown
 * error logged with the route ids plus the viewer id and answered with the
 * safe 500.
 */
function createAttachmentRoute<TParams extends TribeRouteParams>(
  route: {
    copy: AttachmentRouteSessionCopy;
    log: AttachmentRouteLog;
    readMetadata: (params: TParams) => Record<string, unknown>;
  },
  handle: (
    scope: OpenMemberRouteScope,
    params: TParams,
    request: Request
  ) => Promise<Response>
) {
  return async (
    request: Request,
    context: AttachmentRouteContext<TParams>
  ): Promise<Response> => {
    const params = await context.params;

    return handleMemberRoute(
      request,
      {
        feature: route.log.feature,
        operation: route.log.operation,
        unauthorizedMessage: route.copy.unauthorizedMessage,
      },
      {
        logMessage: route.log.failureMessage,
        metadata: route.readMetadata(params),
        responseMessage: route.copy.unexpectedMessage,
      },
      (scope) => handle(scope, params, request)
    );
  };
}

/**
 * Reads the declared upload metadata from the request body. The declared
 * values are validated against the attachment contract by the use case, and
 * the real uploaded size is verified again before the file can be attached.
 *
 * @param body - Parsed request body.
 * @returns The declaration, or `null` when the body is malformed.
 */
function readUploadDeclaration(body: unknown): AttachmentUploadDeclaration | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const fileName = record[ATTACHMENT_UPLOAD_ROUTE_FIELD.fileName];
  const fileSizeBytes = record[ATTACHMENT_UPLOAD_ROUTE_FIELD.fileSizeBytes];
  const mimeType = record[ATTACHMENT_UPLOAD_ROUTE_FIELD.mimeType];

  if (
    typeof fileName !== "string" ||
    typeof mimeType !== "string" ||
    typeof fileSizeBytes !== "number" ||
    !Number.isSafeInteger(fileSizeBytes)
  ) {
    return null;
  }

  return { fileName, fileSizeBytes, mimeType };
}

function createUploadResultResponse(
  result: AttachmentUploadResult,
  copy: AttachmentUploadRouteCopy
): Response {
  if (result.status === ATTACHMENT_STATUS.created) {
    return createRouteJsonResponse(
      {
        assetId: result.assetId,
        uploadHeaders: result.uploadHeaders,
        uploadUrl: result.uploadUrl,
      },
      HTTP_STATUS.created
    );
  }

  return createStatusMessageResponse(
    result.status,
    {
      [ATTACHMENT_STATUS.notFound]: {
        message: copy.notFoundMessage,
        status: HTTP_STATUS.notFound,
      },
      [ATTACHMENT_STATUS.invalidFile]: {
        message: copy.invalidFileMessage,
        status: HTTP_STATUS.badRequest,
      },
    },
    { message: copy.forbiddenMessage, status: HTTP_STATUS.forbidden }
  );
}

/**
 * Builds the `POST .../files/uploads` handler: 401 without a session, 400 for
 * a malformed declaration, the signed upload (201) or the mapped failure, and
 * a logged 500 when anything throws.
 *
 * @param options - Copy, log wiring and module use case of the route.
 * @returns The route handler.
 */
export function createAttachmentUploadRoute(options: {
  copy: AttachmentUploadRouteCopy;
  createUpload: (
    modules: RequestModules,
    command: AttachmentUploadDeclaration & { tribeSlug: string; userId: string }
  ) => Promise<AttachmentUploadResult>;
  log: AttachmentRouteLog;
}) {
  const { copy } = options;

  return createAttachmentRoute<TribeRouteParams>(
    { copy, log: options.log, readMetadata: ({ slug }) => ({ slug }) },
    async ({ member, modules }, { slug }, request) => {
      const body: unknown = await request.json().catch(() => null);
      const declaration = readUploadDeclaration(body);

      if (!declaration) {
        return createRouteJsonResponse(
          { message: copy.invalidFileMessage },
          HTTP_STATUS.badRequest
        );
      }

      const result = await options.createUpload(modules, {
        fileName: declaration.fileName,
        fileSizeBytes: declaration.fileSizeBytes,
        mimeType: declaration.mimeType,
        tribeSlug: slug,
        userId: member.id,
      });

      return createUploadResultResponse(result, copy);
    }
  );
}

/**
 * Builds an attachment download handler: 401 without a session, a redirect
 * (302) to the short-lived signed URL when the viewer can see the file, 400
 * or 404 otherwise, and a logged 500 when anything throws.
 *
 * @param options - Copy, log wiring, log metadata (route ids) and use case.
 * @returns The route handler.
 */
export function createAttachmentDownloadRoute<TParams extends TribeRouteParams>(options: {
  copy: AttachmentDownloadRouteCopy;
  createDownloadUrl: (
    modules: RequestModules,
    params: TParams,
    viewer: { userId: string }
  ) => Promise<AttachmentDownloadResult>;
  log: AttachmentRouteLog;
  readMetadata: (params: TParams) => Record<string, unknown>;
}) {
  const { copy } = options;

  return createAttachmentRoute<TParams>(options, async ({ member, modules }, params) => {
    const result = await options.createDownloadUrl(modules, params, {
      userId: member.id,
    });

    if (result.status === ATTACHMENT_STATUS.created) {
      return Response.redirect(result.downloadUrl, HTTP_STATUS.found);
    }

    return createStatusMessageResponse(
      result.status,
      {
        [ATTACHMENT_STATUS.invalidFile]: {
          message: copy.invalidFileMessage,
          status: HTTP_STATUS.badRequest,
        },
      },
      { message: copy.notFoundMessage, status: HTTP_STATUS.notFound }
    );
  });
}

/**
 * Builds an attachment deletion handler: 401 without a session, 404 for a
 * malformed id, then the deletion outcome (200, 404, 400 for the invalid
 * status, 403 otherwise) and a logged 500 when anything throws.
 *
 * @param options - Copy, id check, invalid status, log wiring and use case.
 * @returns The route handler.
 */
export function createAttachmentDeletionRoute<TParams extends TribeRouteParams>(options: {
  copy: AttachmentDeletionRouteCopy;
  deleteAttachment: (
    modules: RequestModules,
    params: TParams,
    viewer: { userId: string }
  ) => Promise<{ status: string }>;
  hasValidId: (params: TParams) => boolean;
  invalid: { message: string; status: string };
  log: AttachmentRouteLog;
  onDeleted?: (params: TParams) => void;
  readMetadata: (params: TParams) => Record<string, unknown>;
}) {
  const { copy } = options;

  return createAttachmentRoute<TParams>(options, async ({ member, modules }, params) => {
    if (!options.hasValidId(params)) {
      return createRouteJsonResponse(
        { message: copy.notFoundMessage },
        HTTP_STATUS.notFound
      );
    }

    const result = await options.deleteAttachment(modules, params, {
      userId: member.id,
    });

    if (result.status === ATTACHMENT_STATUS.deleted) {
      options.onDeleted?.(params);

      return createRouteJsonResponse(
        { message: copy.successMessage },
        HTTP_STATUS.ok
      );
    }

    return createStatusMessageResponse(
      result.status,
      {
        [ATTACHMENT_STATUS.notFound]: {
          message: copy.notFoundMessage,
          status: HTTP_STATUS.notFound,
        },
        [options.invalid.status]: {
          message: options.invalid.message,
          status: HTTP_STATUS.badRequest,
        },
      },
      { message: copy.forbiddenMessage, status: HTTP_STATUS.forbidden }
    );
  });
}
