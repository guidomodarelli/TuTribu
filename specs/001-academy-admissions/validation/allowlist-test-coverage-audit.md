# Auditoría de criterios T108 y T110

Se contrasta el alcance completo de ambas tareas con los owners, rutas, pruebas y evidencia nativa presentes en `8c4a6f21`, más la nueva regresión de nombre de cien caracteres. Se usa `functionality-check` para separar ejecución real de declaraciones. Esta auditoría no cierra matching personal, concurrencia de dos cuentas, muestra persistida de mil contactos, purga ni todo US3.

## T108 — entrada y recuperación de CSV

| Criterio obligatorio | Evidencia concreta |
| --- | --- |
| UTF-8, coma y encabezado; formato global inválido | `allowlist-csv-parser.test.ts`: BOM, acentos, comillas, multiline, columnas, encoding/NUL/surrogate y errores globales ejercen el parser real. Rutas y use cases rechazan antes de persistir. |
| Diez mil filas y cinco MiB independientes | Parser acepta límites exactos y rechaza exceso; `allowlist-import-authority-persistence.test.ts` persiste diez mil filas sin entradas. La matriz T118 prueba archivos de cinco MiB y restauración real en ambos motores de escritorio. |
| Nombre de cien caracteres | `domain/allowlist-import.test.ts` acepta cien y conserva ciento uno como fila inválida sin seleccionar; aplica el value object real. |
| Errores, duplicados y entradas deshabilitadas | Modelo y Native importación mixed: `added/unchanged/conflict/skipped`; duplicado no reactiva ni cambia nombre/versión de una deshabilitada. |
| Preview sin efectos de lista | Native SQL y HTTP: crear preview/leer/descargar no agrega entradas, vínculos ni miembros; la selección sigue siendo explícita. |
| Confirmación stale | Modelo, autoridad SQL y rutas: versión/política/época o edición reciente cierran selección/confirmación y preservan filas originales. |
| Bloque posterior fallido y resume sólo pendiente | `allowlist-import-persistence.test.ts`: veinticinco éxitos permanecen tras rollback del bloque siguiente; resume explícito procesa sólo filas no confirmadas y concilia el original anterior. Browser T118 reproduce la recuperación sin repetir éxitos. |
| HTML y fórmulas como datos | Modelo y React reales conservan/renderizan texto; reporte CSV neutraliza prefijos estándar y variantes Unicode sin partir celdas. |

La evidencia nativa está registrada en `allowlist-import-persistence-baseline.md`, `allowlist-import-routes-baseline.md` y `allowlist-import-ui-baseline.md`. Los owners de importación no cambiaron en los dos commits de admisión común: el wrapper nuevo pertenece al writer de solicitudes, sin modificar `PostgresAllowlistImportRepository` ni sus variantes de recuperación.

## T110 — gestión y recorrido CSV protegidos

| Criterio obligatorio | Evidencia concreta |
| --- | --- |
| Gestión exclusiva del líder | Resolver real y Native RLS/HTTP/browser: guardian/inactivo/cuenta ajena no gestionan ni leen contactos privados; pérdida de cuenta/liderazgo oculta controles. |
| Filtros y paginación | `allowlist-reader.test.ts` y Native T117: keyset estable, texto literal incluidos `%/_`, filtro de estado, actualizaciones incrementales; sin refresh tras una mutación. |
| Deshabilitar con impacto correcto | Presenter explica autorización futura frente a membresía; CAS real cambia una vez. Native negativo nuevo conserva vínculo y miembro del owner al deshabilitar. |
| Plantilla, preview y selección | Rutas privadas GET template, POST preview y confirmación; archivo no dispara POST al elegirse, filas inválidas/confirmadas no se seleccionan y consentimiento no se restaura. |
| Reporte privado sin fórmulas ejecutables | Serializer real y Native descargas: prefijos neutralizados, header correcto, HTML inerte y autorización actual. |
| Mixed/incomplete | Modelo/result DTO y Native fallo de segundo bloque: progreso realmente confirmado, pendientes explícitos y estados mixed/incomplete sin éxito inventado. |
| Borrador conservado | Componentes reales y matriz de restauración T118: conflicto/respuesta perdida y archivo IndexedDB mantienen borrador por cuenta/academia; cambio de cuenta bloquea publicación. |
| Retries que no repiten éxitos | Native partial/resume/conciliación mantiene resultados por fila; respuesta perdida se consulta por UUID antes de permitir un nuevo comando. |

Los recorridos completos se leen desde la configuración de admisión del líder y sus enlaces de lista/CSV. T117/T118 incluyen evidencia nativa Chromium/WebKit 1280/390 y source-trace. Los test paths del proyecto usan `academy-admission-allowlist-routes.test.ts` y `academy-admissions-allowlist-import-routes.test.ts`; sus nombres equivalentes se verificaron por comportamiento, no por coincidencia con un nombre propuesto en tasks.

## Validación y decisión de cierre

La nueva regresión de cien caracteres y ocho suites focales terminaron: 64 casos verdes en 15,77 s. La CI completa terminó exit 0 con 4.444 tests verdes, lint/tipos y build de 48 páginas. Las pruebas nativas de importación ya tienen resultados terminales aprobados y sus owners permanecen sin cambios. No se atribuye a un skip una ejecución SQL o de navegador.

La revisión read-only por criterio confirmó el alcance completo de T108 y T110, sin añadir ni retirar cláusulas para facilitar el cierre. Se verificaron los 64 casos focales y CI exit 0 contra las evidencias nativas registradas y sus owners intactos; ambas tareas se marcan completas. El conteo actual pasa a 105 completadas y 107 pendientes de 212. T107/T109/T111/T112/T113/T120 y los gates operativos conservan todas sus obligaciones restantes.
