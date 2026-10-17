/** Defines the portable admission maintenance trigger contract, shared with the native Node caller. @module admission-maintenance-trigger */

/** @typedef {"disabled" | "missing_secret" | "invalid_origin" | "request_failed" | "request_unconfirmed"} AdmissionMaintenanceTriggerErrorCode */

/** Selects an explicitly enabled deployment; the endpoint still requires its native bearer. */
export const ADMISSION_MAINTENANCE_TRIGGER = {
  path: "/api/maintenance/admission-messaging",
  cron: "* * * * *",
  enabledEnvironmentKey: "ADMISSION_MESSAGING_MAINTENANCE_ENABLED",
  enabledValue: "true",
  baseUrlEnvironmentKey: "ADMISSION_MESSAGING_MAINTENANCE_BASE_URL",
  secretEnvironmentKey: "CRON_SECRET",
  requestTimeoutMs: 60_000,
  completedHttpStatus: 200,
  busyHttpStatus: 202,
  loopbackHostnames: ["127.0.0.1", "[::1]", "localhost"],
};

/** @type {Readonly<Record<string, AdmissionMaintenanceTriggerErrorCode>>} */
export const ADMISSION_MAINTENANCE_TRIGGER_ERROR = {
  disabled: "disabled",
  missingSecret: "missing_secret",
  invalidOrigin: "invalid_origin",
  requestFailed: "request_failed",
  requestUnconfirmed: "request_unconfirmed",
};

/** Preserves the diagnostic identity across the Node and Workers bundles. */
export const ADMISSION_MAINTENANCE_TRIGGER_ERROR_NAME = "AdmissionMaintenanceTriggerError";

/** Keeps private causes and response bodies out of operator-facing trigger diagnostics. */
export const ADMISSION_MAINTENANCE_TRIGGER_MESSAGE = {
  disabled: "El mantenimiento programado de admisión no está habilitado en este entorno.",
  missing_secret: "El mantenimiento programado requiere CRON_SECRET.",
  invalid_origin: "Configurá un origen HTTPS sin ruta, consulta ni credenciales; HTTP sólo admite loopback.",
  request_failed: "El mantenimiento no terminó correctamente; consultá el estado de sus etapas antes de otra ejecución.",
  request_unconfirmed: "La ejecución no está confirmada; consultá su estado antes de volver a ejecutarla.",
};
