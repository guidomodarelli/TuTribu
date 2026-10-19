/** Names global confirmation states and distinguishes the Google session from the application session. @module reauthentication-ui */
export const REAUTHENTICATION_ROUTES = { page: "/auth/reauthenticate", intents: "/api/auth/reauthentication/intents" } as const;
/** Keeps request lifecycle separate from server-confirmed authentication outcomes. */
export const REAUTHENTICATION_UI_PHASE = { idle: "idle", checking: "checking", redirecting: "redirecting" } as const;
/** Uses fixed Spanish feedback; upstream error text is never a rendering source. */
export const REAUTHENTICATION_UI_COPY = {
  title: "Confirmá tu cuenta",
  description: "Para esta acción, confirmá tu cuenta con Google. Podés mantener abierta tu sesión de Google y la de TuTribu.",
  verifiedTitle: "Cuenta confirmada",
  unavailableTitle: "No podemos confirmar esta acción",
  loading: "Consultando tu solicitud de autenticación…",
  start: "Confirmar con Google",
  redirecting: "Redirigiendo a Google…",
  read: "Consultar estado",
  checking: "Consultando estado…",
  continue: "Continuar con la acción",
  return: "Volver a la tribu",
  restart: "Volver a la acción e iniciar otra confirmación",
  expired: "Este intento ya terminó. Prepará una nueva confirmación desde la acción que querés completar; consultar el intento anterior no lo vuelve a habilitar.",
  home: "Ir al inicio",
  signIn: "Iniciar sesión",
  authorizing: "La confirmación ya comenzó. Consultá su resultado; si no podés completarla, volvé a la tribu para iniciar una nueva.",
  required: "Este intento no pudo confirmar tu cuenta para la acción. Volvé a la tribu e iniciá una nueva confirmación. Podés mantener abierta tu sesión de Google.",
  verified: "Esta confirmación vale durante diez minutos para esta acción. Al continuar, se volverán a comprobar tu sesión, tus permisos y su vigencia.",
  oauthFailed: "Google no completó la confirmación. Consultá el estado antes de iniciar otra solicitud.",
  startFailed: "No pudimos iniciar la confirmación. Consultá el estado antes de volver a intentarlo.",
  readFailed: "No pudimos consultar el resultado. Consultá el estado nuevamente.",
} as const;
/** Names the WebKit-compatible event used to reconcile a restored OAuth page. */
export const REAUTHENTICATION_PAGE_SHOW_EVENT = "pageshow";
