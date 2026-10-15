# Validación de seguridad y conservación

Registro de cierre guardado en `390f45e694566ddcdab5d4eec69b08e4b691d8fd`, con su control completo de GitHub Actions aprobado. Los hashes, equivalencias de producto y observaciones de esta matriz corresponden a ese cierre. Los cambios posteriores de decisiones por lote tienen [validación propia](batch-decisions-baseline.md) y no heredan esta certificación por compartir la rama.

T175 queda validada con su alcance original completo: los cinco AC de US11, cuotas concurrentes, rotación, retención PostgreSQL real, superficies de salida, decisiones reconstruibles y blockers operativos concretos. El inventario conserva las 212 tareas: **174 completadas y 38 pendientes**. El cierre de esta validación no cierra T106, T201, T211 ni los gates operativos.

## Evidencia actual y alcance del conteo

El [manifiesto sanitizado de resultados](security-and-retention-results.json) conserva archivos relativos, hashes normalizados, identificadores opacos de casos, flags de cada grupo y evidencia de build/limpieza. Registra **429 casos aprobados en 54 archivos completos**, más **un caso focal aprobado de reducción del cupo después del claim**. Los trece casos de ese archivo que quedaron fuera del filtro no se presentan como ejecutados ni aprobados.

| Grupo actual | Archivos completos | Casos aprobados | Alcance |
|---|---:|---:|---|
| Contratos locales de autenticación, HTTP, cifrado y observabilidad | 21 | 316 | Incluye 78 contratos de rutas y los nueve casos de observación con su fuente corregida. |
| Captura privada y SDK real con transporte cerrado | 2 | 20 | Cuatro capturas reales Chromium/WebKit a 1280/390 y dieciséis contratos del SDK. |
| PostgreSQL Native | 30 | 92 | Cuotas, aislamiento, autoridad, keyrings, retención y borrados reales. |
| Reporter final de Next compilado | 1 | 1 | SQL provoca una causa privada; el logger real produce sólo su JSON permitido. |
| Total de archivos completos | 54 | 429 | Sin fallos ni casos omitidos dentro de estos archivos con sus flags indicados. |

El caso focal adicional de `message-delivery-repository.test.ts` reclama una entrega ya encolada, reduce el cupo vigente a cero y comprueba `quota_exceeded`, ausencia de intento/reserva y auditoría ligada al ledger original. Su resultado es **1 aprobado, 13 fuera del filtro**. Su alcance se limita a ese escenario.

El conteo distingue archivo, título y ordinal de parametrización: conserva variantes con igual título y cuenta una sola vez las repeticiones. Excluye fuentes modificadas sin revalidación, archivos incompletos y entradas vacías del primer reporte. Los cinco casos aprobados de la antigua suite de credenciales no se suman a los ocho de su reemplazo actual; tampoco se duplican los cuatro casos de retención ni los nueve de observación.

## Matriz de requisitos originales

| Requisito | Resultado observado y evidencia |
|---|---|
| US-11-AC-01: último cupo con cien competidores | `delivery-attempts-and-usage.test.ts` ejerce claims/markers PostgreSQL: un autorizado, 99 rechazos por cuota y consumo conservado al perder el worker. |
| US-11-AC-01: cuenta/contacto entre tribus y canales | `account-code-request-budget`, `code-request-budget`, `contact-budget-continuity`, `shared-verification-bucket` y límites de fallos verifican ventanas móviles/UTC y continuidad entre contactos, propósitos, canales y tribus. |
| US-11-AC-01: sesión, clave y pagador originales | `verification-quota-connection-session`, presupuesto de credenciales y `messaging-isolation-and-rotation` conservan consumo, conexión/versión e intent. `accepted` y `unknown` no habilitan otro envío ni otro pagador. |
| US-11-AC-02: cupo reducido con trabajo en cola | El focal reclama antes de reducir el límite y revalida al autorizar. Los tres casos completos de `messaging-zero-quota-admission` prueban que el worker no prepara credenciales ni llama al SDK con cupo cero, conservando la verificación obligatoria. `platform-country-marker` comprueba también las restricciones actuales de SMS/WhatsApp. |
| US-11-AC-03: payload y autoridad no elegibles | Los 78 contratos rechazan remitente, destino, texto, plantilla y campos de autoridad antes de componer el módulo. `admission-security-and-privacy` usa Next compilado: recursos cruzados 404, entradas inválidas 400, origen ajeno 403 y ningún efecto persistido. |
| US-11-AC-04: respuestas y autenticación | Contratos locales, `better-auth-private-http-native` y el logger privado de Better Auth ejercen sesión/cookies reales y rutas de tokens. Las salidas propias conservan campos permitidos y causas privadas. |
| US-11-AC-04: logs, analítica y trazas | `admission-dispatch-final-logger-native` inyecta mediante PostgreSQL una causa con credencial, OTP y canario generados. El reporter real conserva correlación y claves cerradas, sin material privado ni campo `error`. `admission-observability-reader` verifica agregados privados y dimensiones cerradas. |
| US-11-AC-04: captura de controles privados | `admission-private-widget-capture` usa componentes y widget publicados, JPEG real, control negativo y ambos motores en dos anchos; las imágenes permanecen en memoria. |
| US-11-AC-05: confianza local y Google global | `admission-verification-scope-isolation` y los contratos MAC ejercen códigos genuinos en ámbitos distintos y diagnóstico local. Su validación no crea evidencia global, pertenencia ni recuperación de cuenta. |
| Rotación de cifrado separada de BYOK | `messaging-protection-key-rotation` y su suite de borrado verifican plaintext/referencias/versiones/consumo conservados, CAS, lotes acotados, rollback y conciliación de commit incierto sin retry automático. |
| Fingerprint y payload MAC durante ventanas activas | `contact-budget-continuity`, `messaging-key-material-continuity` y `payload-key-rotation-persistence` conservan sujeto, aliases, consumo y operación original. Material ausente o sustituido bajo el mismo id cierra antes de crear otra identidad o claim. |
| Seis propósitos y recuperación cerrada | Crypto/hosting locales, `encrypted-secret-store` y rotación Native verifican material independiente/no extraíble, AAD contextual y rechazo por recovery lock/época. No hay fallback de material. |
| Secreto retirado y candidata | `encrypted-secret-store`, `retired-secret-purge-deadline` y `messaging-candidate-expiration` verifican bloqueo previo a la purga, plazo de 24 horas y candidata de siete días más 24 horas, con reloj original conservado en ejecuciones tardías. |
| OTP de como máximo diez minutos | Crypto y `verification-material-maintenance` conservan expiración original, destruyen bytes después de aceptación y retienen el material de un intento incierto todavía vigente; el consumo y los receipts permanecen. |
| CSV de 24 horas, terminales de 180 días y auditoría de 365 | `allowlist-import-material-retention`, `admission-private-data-retention` y `admission-retention-composition` ejecutan SQL real: material fresco preservado, límites globales, no-op, rollback, archivo con fecha original y resultados mínimos conservados. |
| Borrado sin liberar vínculos necesarios | `allowlist-binding-account-deletion`, `admission-tribe-deleted-budgets` y retención privada conservan referencias/consumo necesarios y rechazan otra identidad para un contacto reservado. |
| Decisiones reconstruibles sin secretos | Constructores y casos de uso de auditoría, lectores SQL y fases del worker conservan actor/regla/tribu/recurso/versión/operación originales. Auditoría privada y agregados mantienen sus ámbitos distintos. |
| Blockers operativos concretos | La observación del piloto y del proceso local se detalla abajo. Registra configuración/restore/preparación real pendientes; los escenarios sintéticos no certifican OG-01 a OG-06. |

## Superficies y composición revisadas

La ruta de challenges y `admission-contact-verification-handlers` validan origen, params, query y body antes de abrir la composición. `own-json-route-boundary` valida únicamente inputs y DTOs propios; sus diagnósticos seleccionan etapa/código/correlación y no incluyen el body ni la causa cruda. Este rechazo estructural ocurre antes de resolver la cuenta y se aplica a cualquier caller.

`messaging-route-http` prioriza status y narrowing mínimo del proveedor. El sender real conserva un cliente por intento, URL/método/redirección fijos, `maxRetries=0`, `logLevel=off` y ausencia de fallback. `messaging-observability`, `AuthDatabaseOperationError` y `admission-metric-dimensions` mantienen proyecciones cerradas. La búsqueda de salidas en ambos módulos y el caso Native del reporter contrastan el contrato hasta la consola real de Next.

La revisión de acceso agrupado ya comprobó el checkout guardado y sus usos hermanos; este incremento no modifica pools, transacciones, retries ni llamadas de producto. ORM, Better Auth, Zod, Web Crypto, SDK y controles compartidos se ejercen realmente; los dobles corresponden a puertos propios o al transporte HTTP cerrado. Sólo el caso de reloj controla los timers estándar y los restaura en `finally`.

## Entorno, build y recursos

Node 24.21.0, pnpm 12.6.0, Next 16.3.4 y dependencias instaladas con lockfile congelado. El build aislado real terminó con código cero. Se volvieron a contrastar los 1727 archivos de producto con la copia que ejecutó Next: 121 diferencias de bytes son exclusivamente CRLF/LF y no hay otras diferencias. Los 175 artefactos versionados de migración también coinciden normalizando CRLF/LF. El producto permanece equivalente al build de `9890f321`; los cambios posteriores de este trabajo son fixtures, pruebas y registros.

Las ramas SQL pertenecen al arnés verificado; sus migraciones se aplican exclusivamente allí y se prueban roles reales, incluido el que no tiene bypass RLS. La conciliación del `2026-10-15T10:18:52.145Z` confirma ausencia de todas las ramas de validación y conserva producción y el piloto original: dos ramas, ninguna otra. Los receipts de la copia aislada se preservaron antes de su limpieza.

El último caso del reporter requería `RUN_ADMISSION_BROWSER_TESTS=1` y había quedado omitido con los flags de la primera continuación. Su ejecución original detectó `ENOENT` al tratar `.git` como carpeta dentro de un worktree. Se corrigió únicamente la captura: archivo temporal propio, creación exclusiva y eliminación en `finally`. El caso completo pasó con el servidor, PostgreSQL y SDK reales y transporte cerrado.

## Diagnóstico conservado

La primera tanda de cuotas terminó 28/2. La prueba de sesión vencida había suspendido antes su recurso al perder liderazgo; se separó de ese escenario. El supuesto historial sin vínculo se estaba insertando después del journal completo; ahora se crea mediante el prefijo real previo a su guarda y atraviesa el upgrade íntegro. Los ocho casos actuales pasan, con fechas, identidad, anonimización y consumo conservados.

La primera tanda de seguridad terminó 36 aprobados, un fallo de confirmación de limpieza y dos pendientes. Se concilió la rama propia y se ejecutaron los archivos faltantes. La continuación terminó 25/0 con un caso omitido; la ejecución explícita posterior del reporter completa ese caso. Los resultados iniciales y sus entradas vacías no se usan como aprobación.

El CI también expuso una comprobación temporal de observación: los nueve casos originales pasaron localmente, pero el CI obtuvo `deadlineReached=false` con contadores correctos. El caso corregido comprueba espera justo antes del límite, salida al alcanzarlo, una escritura tardía original y cero timers pendientes. Los nueve completos pasan; no cambia el worker.

## Blockers operativos y límites de la evidencia

La observación `2026-10-15T10:18:45.381Z` verificó la rama exacta del piloto y consultó sólo agregados con `pg` en una transacción de lectura, timeouts y cierre de conexión. Confirmó una tribu, una candidata, una credencial protegida y validada, estado `draft`, cero seleccionadas, cero capacidades preparadas y cero intentos externos.

| Área | Hecho concreto y trabajo conservado |
|---|---|
| Keys/época | El proceso observador local no tiene entorno, época, recovery lock explícito ni keyrings configurados. Su material no se decodificó ni se contrastó con la candidata. El servidor/hosting original conserva su verificación propia pendiente; este resultado no afirma pérdida ni ausencia de sus claves. |
| Restore | Falta el ensayo operativo con inventario original y época externa del entorno objetivo, requerido por T201/OG-02. Los ensayos sintéticos sí prueban bloqueo, rollback y continuidad; el original se conserva y no se crean claves sustitutas. |
| Abuso/proveedor | El piloto continúa sin selección ni canales preparados y no registra intentos externos. T106 y OG-03/OG-04 requieren recursos reales, restricciones, recepción y consumo comprobados. SDK/cuotas sintéticos no acreditan gasto monetario ni límites reales del proveedor. |

Los tests no realizan envíos externos ni certifican Google global real, hosting, scheduler, restore o los seis gates. La purga observada corresponde a las filas actuales; backups/WAL e historial del proveedor conservan sus requisitos operativos.

## Reproducción

El manifiesto permite ejecutar las mismas listas por grupo, con sus flags indicados, usando el build aislado y el arnés de ramas propias. El grupo de captura requiere Chromium y WebKit instalados. Las credenciales de Neon permanecen en el perfil privado del CLI; el selector de base/rol no sustituye la URL propia que obtiene el arnés.

```powershell
$securityResults = Get-Content -Raw specs/001-academy-admissions/validation/security-and-retention-results.json | ConvertFrom-Json
$previousSqlFlag = $env:RUN_ADMISSION_SQL_TESTS
$previousBrowserFlag = $env:RUN_ADMISSION_BROWSER_TESTS
try {
  foreach ($securityGroup in $securityResults.executionGroups) {
    $env:RUN_ADMISSION_SQL_TESTS = $securityGroup.environment.RUN_ADMISSION_SQL_TESTS
    $env:RUN_ADMISSION_BROWSER_TESTS = $securityGroup.environment.RUN_ADMISSION_BROWSER_TESTS
    $securityFiles = @($securityGroup.files)
    pnpm exec vitest run @securityFiles --maxWorkers 1
    if ($LASTEXITCODE -ne 0) { throw "Falló la cohorte de seguridad: $($securityGroup.id)" }
  }
} finally {
  $env:RUN_ADMISSION_SQL_TESTS = $previousSqlFlag
  $env:RUN_ADMISSION_BROWSER_TESTS = $previousBrowserFlag
}
```

El focal adicional se ejecuta con los flags Native y su `testNamePattern` exacto del manifiesto; sus trece casos filtrados permanecen fuera de esta evidencia. El control completo de GitHub Actions y sus fixes de sincronización tienen su registro separado en [quality-gate.md](quality-gate.md); T211 continúa abierta.
