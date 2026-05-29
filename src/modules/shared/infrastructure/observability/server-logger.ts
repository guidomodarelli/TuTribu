export type ServerLogLevel = "info" | "warn" | "error";

const SERVER_LOG_ERROR_MESSAGE = {
  unknownError: "Unknown error",
} as const;

const SERVER_LOG_FIELD = {
  message: "message",
} as const;

export const SERVER_LOG_LEVEL = {
  error: "error",
  info: "info",
  warn: "warn",
} as const;

export type ServerLogEntry = {
  level: ServerLogLevel;
  message: string;
  feature: string;
  operation: string;
  requestId: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
  error?: {
    message: string;
    name?: string;
    stack?: string;
  };
};

type ServerLoggerContext = {
  feature: string;
  operation: string;
  requestId: string;
  traceId?: string;
};

type ServerLoggerInput = {
  message: string;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

function serializeError(error: unknown): ServerLogEntry["error"] | undefined {
  if (!error) {
    return undefined;
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    SERVER_LOG_FIELD.message in error
  ) {
    const errorWithMessage = error as {
      message?: unknown;
      name?: unknown;
      stack?: unknown;
    };

    return {
      message:
        typeof errorWithMessage.message === "string"
          ? errorWithMessage.message
          : SERVER_LOG_ERROR_MESSAGE.unknownError,
      name:
        typeof errorWithMessage.name === "string" ? errorWithMessage.name : undefined,
      stack:
        typeof errorWithMessage.stack === "string" ? errorWithMessage.stack : undefined,
    };
  }

  return {
    message: String(error),
  };
}

function writeLog(level: ServerLogLevel, entry: ServerLogEntry) {
  const serializedEntry = JSON.stringify(entry);

  if (level === SERVER_LOG_LEVEL.error) {
    console.error(serializedEntry);
    return;
  }

  if (level === SERVER_LOG_LEVEL.warn) {
    console.warn(serializedEntry);
    return;
  }

  console.info(serializedEntry);
}

export function createServerLogger(context: ServerLoggerContext) {
  const buildEntry = (
    level: ServerLogLevel,
    input: ServerLoggerInput
  ): ServerLogEntry => ({
    level,
    message: input.message,
    feature: context.feature,
    operation: context.operation,
    requestId: context.requestId,
    traceId: context.traceId,
    metadata: input.metadata,
    error: serializeError(input.error),
  });

  return {
    info(input: ServerLoggerInput) {
      writeLog(SERVER_LOG_LEVEL.info, buildEntry(SERVER_LOG_LEVEL.info, input));
    },
    warn(input: ServerLoggerInput) {
      writeLog(SERVER_LOG_LEVEL.warn, buildEntry(SERVER_LOG_LEVEL.warn, input));
    },
    error(input: ServerLoggerInput) {
      writeLog(SERVER_LOG_LEVEL.error, buildEntry(SERVER_LOG_LEVEL.error, input));
    },
  };
}
