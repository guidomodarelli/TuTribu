/** Names global confirmation states and distinguishes the Google session from the application session. @module reauthentication-ui */
export const REAUTHENTICATION_ROUTES = { page: "/auth/reauthenticate", intents: "/api/auth/reauthentication/intents" } as const;
/** Keeps request lifecycle separate from server-confirmed authentication outcomes. */
export const REAUTHENTICATION_UI_PHASE = { idle: "idle", checking: "checking", redirecting: "redirecting" } as const;
/** Uses fixed Spanish feedback; upstream error text is never a rendering source. */
export const REAUTHENTICATION_UI_COPY = {
  title: "Confirmá tu autenticación",
  description: "Esta acción requiere una autenticación de Google de los últimos diez minutos. La sesión de TuTribu puede seguir abierta.",
  verifiedTitle: "Autenticación confirmada",
  unavailableTitle: "No podemos confirmar esta acción",
  loading: "Consultando tu solicitud de autenticación…",
  start: "Confirmar con Google",
  redirecting: "Redirigiendo a Google…",
  read: "Consultar estado",
  checking: "Consultando estado…",
  continue: "Continuar con la acción",
  return: "Volver a la tribu",
  home: "Ir al inicio",
  signIn: "Iniciar sesión",
  authorizing: "La confirmación ya comenzó. Consultá su resultado; si no podés completarla, volvé a la tribu para iniciar una nueva.",
  required: "Salir de TuTribu no cierra la sesión de Google del navegador. Si Google mantiene una sesión anterior, cerrá sesión en Google y volvé a entrar allí; después volvé a la tribu para iniciar una nueva confirmación. Esta acción todavía no está autorizada.",
  verified: "La acción volverá a comprobar tu sesión, tus permisos y la vigencia de la autenticación al continuar.",
  oauthFailed: "Google no completó la confirmación. Consultá el estado antes de iniciar otra solicitud.",
  startFailed: "No pudimos iniciar la confirmación. Consultá el estado antes de volver a intentarlo.",
  readFailed: "No pudimos consultar el resultado. Consultá el estado nuevamente.",
} as const;
/** Names the WebKit-compatible event used to reconcile a restored OAuth page. */
export const REAUTHENTICATION_PAGE_SHOW_EVENT = "pageshow";
