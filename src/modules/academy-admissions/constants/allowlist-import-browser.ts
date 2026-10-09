/** Owns upload, explicit selection, recovery and private download UI behavior. @module allowlist-import-browser-constants */
export const ALLOWLIST_IMPORT_SETTINGS_SEGMENT = "academia/admissions/allowlist/imports";
export const ALLOWLIST_IMPORT_STORAGE_PREFIX = "tutribu-allowlist-import";
export const ALLOWLIST_IMPORT_FILE_NAME_CHARACTERS = 255;
export const ALLOWLIST_IMPORT_DOWNLOAD_RETENTION_MS = 30_000;
export const ALLOWLIST_IMPORT_VISIBLE_ROW_COUNT = 50;
export const ALLOWLIST_IMPORT_FILE_ACCEPT = ".csv,text/csv";
export const ALLOWLIST_IMPORT_FILE_NAME = { template: "allowlist-import-template.csv", report: "allowlist-import-report.csv" } as const;
export const ALLOWLIST_IMPORT_BROWSER_PATH = { imports: "allowlist/imports", template: "template", report: "report", confirm: "confirm", policy: "policy" } as const;
export const ALLOWLIST_IMPORT_BROWSER_COPY = {
  checking: "Comprobando acceso…", reading: "Consultando la importación…", uploading: "Leyendo el archivo…", previewing: "Guardando la vista previa…", confirming: "Confirmando las filas seleccionadas…",
  file: "Elegí un CSV válido en UTF-8, con identity,display_name, hasta 10.000 filas y 5 MiB.", confirmation: "Confirmá el paso antes de continuar.", selection: "Elegí al menos una fila válida pendiente.",
  previewed: "La vista previa está lista. Todavía no se agregó ninguna entrada.", confirmed: "La confirmación terminó. Revisá los resultados de cada fila.", partial: "Hay resultados guardados y filas pendientes. Consultá la operación original antes de reanudar.",
  uncertain: "La respuesta no quedó confirmada. Conservamos el borrador y la referencia; consultá la operación original antes de continuar.", absent: "La operación todavía no aparece. Conservamos su referencia y no repetimos la escritura.", started: "La operación original sigue en proceso. Consultá el progreso actual; sólo se pueden retomar filas sin resultado.",
  conflict: "La importación cambió. Conservamos tu selección: consultá el progreso actual y confirmá nuevamente las filas pendientes.", policyConflict: "La configuración cambió. Conservamos el archivo: consultá la configuración actual antes de crear otra vista previa.",
  storage: "No pudimos conservar este borrador en el navegador. Revisá el espacio disponible antes de continuar.", account: "La cuenta o el acceso cambió. Volvé a cargar esta página para continuar.",
  noPolicy: "Guardá la configuración de admisión antes de importar contactos.", expired: "La vista previa venció. Elegí nuevamente el archivo para preparar otra importación.",
  reauthentication: "Confirmá tu identidad con Google para continuar con este paso de importación.", reauthenticationFailed: "No pudimos preparar la confirmación de identidad. Conservamos el borrador para intentarlo otra vez.",
  downloaded: "Se preparó la descarga privada.", empty: "El archivo no contiene filas de datos. Elegí otro CSV para importar.",
  historical: "La operación original quedó confirmada. Sus filas temporales ya no están disponibles; podés elegir otro archivo sin repetir esa escritura.",
  currentReadFailed: "La operación original quedó confirmada. No pudimos consultar el progreso actual; volvé a consultarlo antes de confirmar otro cambio.",
  missingDraft: "El archivo local ya no está disponible. Conservamos las referencias de operaciones; consultá su resultado antes de elegir otro archivo.",
} as const;
