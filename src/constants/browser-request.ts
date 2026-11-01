/**
 * Bounds shared by the browser adapters of own routes, so a hung response never leaves an action in progress forever.
 *
 * @module browser-request-constants
 */

/**
 * Longest wait for an own route's response before the browser stops waiting and reports it. It matches the deadline of
 * the flows that already bound their own requests (contact verification, allowlist, personal invitations), so wrapping
 * their adapters never shortens it.
 */
export const BROWSER_REQUEST_TIMEOUT_MS = 120_000;

/** Safe copy for a response that did not arrive in time; a write may have committed, so it asks to check first. */
export const BROWSER_REQUEST_TIMEOUT_MESSAGE = "La respuesta tardó demasiado. Consultá el estado antes de repetir la acción.";

/**
 * Safe copy for a request that never reached an own route, or whose reply could not be read (a cut network, an edge HTML page).
 * It replaces the catalogue copy of `dependency_unavailable`, which speaks of a server dependency, when the browser itself failed.
 */
export const BROWSER_REQUEST_TRANSPORT_MESSAGE = "No pudimos conectar con TuTribu. Revisá tu conexión y volvé a intentarlo.";

/** Safe copy for a session that could not be read: it proves no account change, so the private view stays and the action can be retried. */
export const BROWSER_SESSION_CHECK_MESSAGE = "No pudimos comprobar tu sesión. Volvé a intentarlo en unos segundos.";
