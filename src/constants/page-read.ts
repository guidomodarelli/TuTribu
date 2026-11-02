/**
 * Safe copy of a page that could not show its server snapshot. The error catalogues of each feature speak of a write or of the
 * applicant ("Conservá los datos y consultá el estado", "antes de confirmar", "continuar con el ingreso"); a read has neither an
 * operation nor data to keep, so its unavailable states use this copy instead.
 *
 * @module page-read-constants
 */
export const PAGE_READ_COPY = {
  /** The address cannot be read: a malformed or truncated link, an extra parameter or a manipulated cursor. */
  invalidAddress: "El enlace no es válido. Revisalo o volvé a abrir esta sección desde TuTribu.",
  /** No session, or it ended between checks. */
  signInRequired: "Iniciá sesión para ver esta página.",
  /** The current account cannot see this page. */
  permissionDenied: "No tenés permiso para ver esta página.",
  /** The tribe, request or resource of the address does not exist for this account. */
  notFound: "No encontramos lo que buscás. Puede que ya no exista o que el enlace sea de otra academia.",
  /** A change landed between two statements of the same read; reading again shows a consistent snapshot. */
  changedWhileReading: "La información cambió mientras la cargábamos. Volvé a intentarlo.",
  /** A dependency, the server or the reply failed in a way that can pass. */
  unavailable: "No pudimos cargar esta página. Intentá de nuevo en unos minutos.",
} as const;
