/** Copy and diagnostic codes of the notice shown while the platform cannot protect admission or messaging writes. @module platform-security-notice */
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/** Same codes the rules page lists, so support reads one diagnostic code from every screen. */
export const PLATFORM_SECURITY_DIAGNOSTIC_CODE = {
  security_unconfigured: "admission_security_unconfigured",
  recovery_locked: "admission_recovery_locked",
} as const satisfies Record<PlatformSecurityRequirement, string>;

/** What the leader reads for each requirement; neither one can be resolved from the academy. */
export const PLATFORM_SECURITY_REQUIREMENT_COPY = {
  security_unconfigured: "La plataforma todavía no tiene configurada la seguridad que protege estas operaciones.",
  recovery_locked: "La plataforma pausó estas operaciones mientras recupera un servicio.",
} as const satisfies Record<PlatformSecurityRequirement, string>;

export const PLATFORM_SECURITY_NOTICE_COPY = {
  title: "Depende del equipo de TuTribu",
  /** Default consequence; each screen may say what stays unavailable there. */
  consequence: "Esto no es algo que puedas resolver desde tu academia. Mientras tanto no se pueden guardar cambios en esta sección.",
  diagnosticLabel: "Código de diagnóstico",
  copy: "Copiar código",
  copied: "Código copiado.",
  copyFailed: "No pudimos copiar el código. Seleccionalo y copialo a mano.",
  recheck: "Volver a comprobar",
  /** Shown when the recheck still finds the requirement. */
  rechecked: "Volvimos a comprobar: todavía depende del equipo de TuTribu.",
  report: "Reportar el problema",
  reportUnavailable: "No pudimos abrir el reporte. Escribile al equipo de TuTribu e incluí el código de diagnóstico.",
} as const;
