const HTTP_HEADER_NAME = {
  contentType: "Content-Type",
} as const;

const HTTP_CONTENT_TYPE = {
  applicationJson: "application/json",
} as const;

/** Fields every course entity (course, module, lesson) carries in an API answer. */
export type CourseEntityEntry = Record<string, unknown> & {
  id: string;
  isActive: boolean;
  sortOrder: number;
  title: string;
};

/**
 * Reads the course entity an API answer carries under `key`, checking the
 * fields every entity shares. Callers check and map their own fields.
 * @param payload - Parsed response body.
 * @param key - Property holding the entity (`course`, `courseModule`, `lesson`).
 * @returns The raw entity, or `null` when it is missing or malformed.
 */
export function readCourseEntityEntry(
  payload: unknown,
  key: string
): CourseEntityEntry | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = (payload as Record<string, unknown>)[key];
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const entry = candidate as Record<string, unknown>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.title !== "string" ||
    typeof entry.sortOrder !== "number" ||
    typeof entry.isActive !== "boolean"
  ) {
    return null;
  }
  return entry as CourseEntityEntry;
}

/**
 * Sends a JSON request to a course endpoint.
 * @param url - Endpoint.
 * @param method - HTTP method.
 * @param body - JSON body.
 * @returns The response.
 */
export function sendCourseJson(
  url: string,
  method: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: {
      [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
    },
    method,
  });
}
