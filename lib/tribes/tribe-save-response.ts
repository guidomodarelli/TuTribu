/** Copy a tribe management screen shows after a save request. */
export type TribeSaveResponseCopy = {
  /** Error shown when the server rejects the save without a message. */
  fallbackSaveError: string;
  /** Confirmation shown when the server accepts the save without a message. */
  saveSuccess: string;
};

/**
 * Reads the answer of a tribe management save request.
 * @param response - Response of the save request.
 * @param copy - Fallback error and confirmation of the screen.
 * @returns The confirmation to show: the server message, or the screen's one.
 * @throws {Error} With the server message, or the fallback error, when the
 * save failed.
 */
export async function readTribeSaveResponseMessage(
  response: Response,
  copy: TribeSaveResponseCopy
): Promise<string> {
  const responseBody = (await response.json().catch(() => ({}))) as {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(responseBody.message ?? copy.fallbackSaveError);
  }

  return responseBody.message ?? copy.saveSuccess;
}
