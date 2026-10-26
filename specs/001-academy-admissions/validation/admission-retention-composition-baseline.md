# Composición atómica de retención privada

Unidad sobre `195ca4c9499c433bb4ea07e546148293e76fde66`. El objetivo conserva sus 212 tareas. T171 queda completada en su alcance de mantenimiento privado: 165 tareas completadas y 47 pendientes. La programación y el driver general mantienen el alcance propio de T186. T166/T168/T169/T170 conservan sus pruebas/rotación/instrumentación restantes; no se acreditan restore, hosting ni gates operativos por este cierre.

## Alcance y responsabilidades

| Categoría | Owner conservado | Entrada atómica |
|---|---|---|
| CSV/reporte, 24 horas | `PostgresAllowlistImportMaterialRetention` | `buildAdmissionDataRetentionModule` |
| Contactos duplicados y mensajes terminales, 180 días originales | `PostgresAdmissionPrivateDataRetention` | `buildAdmissionDataRetentionModule` |
| Auditoría viva/archivada, 365 días originales | `PostgresAdmissionPrivateDataRetention`, con límite compartido | `buildAdmissionDataRetentionModule` |
| Candidata abandonada, siete días y 24 horas posteriores | `PostgresMessagingCandidateExpiration` | `buildMessagingSecretRetentionModule` |
| Credencial retirada, 24 horas | `PostgresSecretMaterialMaintenance` | `buildMessagingSecretRetentionModule` |
| Material OTP, menor necesidad y TTL original | `PostgresVerificationMaterialMaintenance` | `buildMessagingSecretRetentionModule` |

Cada entrada valida todos sus límites antes de iniciar trabajo. El módulo de admisión recibe límites de filas de importación, solicitudes y auditoría; mensajería recibe límites de candidatas, credenciales y material OTP. Los defaults y techos pertenecen a los owners existentes. No se multiplican por archivo, versión o tribu. El lote devuelve resultados propios explícitos por owner, sin materiales, contactos, archivos o causas privadas.

## Transacciones y recuperación

Cada familia comparte una única `RequestDatabase` y un commit externo. Los adapters originales ejecutan sus callbacks sobre esa misma transacción; no adquieren conexiones anidadas. Se mantienen SQL, orden de locks, plazos y clocks originales, sin cambios de estructura ni migración nueva. Candidatas se retiran antes de la purga de credenciales/OTP, conservando los vencimientos originales y evitando contar dos veces un sobre ya purgado de inmediato.

El executor y las dos lecturas de autoridad/recuperación son dependencias privadas obligatorias, sin sender, SDK ni keyrings. La autoridad se revalida antes y después de awaits del gate y dentro de la transacción. Las comprobaciones entre owners protegen también credenciales y OTP. Se ejecutan fuera de los catches de cada leaf para conservar `resource_unavailable` ante un stop conocido, en vez de envolverlo como commit incierto. Si el último paso pierde autoridad o aparece un stop de recuperación, los pasos anteriores del mismo lote se revierten. Ningún contador sale antes del commit.

La confirmación de commit perdida conserva `operation_unresolved` y su causa original privada, sin retry automático. El caller debe inspeccionar la fuente; una pasada nueva explícita es idempotente. Las dos familias tienen commits independientes: un caller futuro debe conservar progreso confirmado si la otra falla, sin fabricar éxito global. Cero efectos no acredita que terminen otras colas, fases ni gates.

## Validación comprobada

Treinta y dos pruebas locales, tipos de producto/tests y lint pasan. Las nuevas pruebas locales ejercen defaults, límites mínimo/máximo y rechazo de todos los campos antes del owner, además de conservar causa y una única invocación ante incertidumbre. Se reutilizan los tests de los tres casos de uso anteriores.

La validación PostgreSQL combina las seis categorías sobre el comando completo de 66 migraciones. Los helpers de importación y candidatas separan preparación histórica de seeding. El primer 0/4 conserva un rechazo real: `pg` confirmó SQL23514, routine `exec_stmt_raise` y el trigger de inserción activo, porque el fixture intentaba insertar material ya vencido después de instalar su guard. El fixture corregido aplica el prefijo real del journal con Drizzle, crea los datos históricos y aplica el resto con el comando completo; conserva hashes, fechas originales y todos los triggers. No se elimina ni deshabilita un guard ni se reejecuta SQL registrado. Los archivos temporales de ese prefijo se eliminan sólo tras verificar su raíz y nombre propios. Comprueba cada lote confirmado, conservación de historia/material reciente, una sola conexión por familia, rollback de todos los pasos por autoridad/restore tardíos y commit perdido. El archivo final aprueba sus cuatro casos sin fallos ni filtros. Tres casos adicionales del owner OTP también pasan: eliminan bytes de una entrega confirmada conservando el código todavía válido y el consumo, conservan el sobre de un intento incierto vigente, purgan vencidos en concurrencia y rechazan acceso SQL ordinario/retiro de autoridad. Son siete recorridos PostgreSQL distintos; el ensayo inicial 1/0/3 del prefijo no se suma otra vez al total.

## Alcance operativo

Estas entradas son privadas de backend. No hay ruta HTTP, botón, scheduler ni envío externo nuevo. La programación, resultados operativos por paso y last successful run del driver completo siguen en T186. La rotación de protección, recuperación de backups, piloto y despliegue conservan sus tareas y autorizaciones originales. No se ejecuta mantenimiento sobre producción ni el piloto.


## Auditoría de cierre de T171

| Criterio | Evidencia comprobada |
|---|---|
| Seis categorías de retención con sus plazos originales | Primer caso de `admission-retention-composition.test.ts`, sobre el journal real completo; material fresco, selección, resultados y uso conservados |
| Límites e idempotencia | 32 locales, límites inválidos rechazados antes de checkout, replay de ambas familias sin duplicados ni otra purga |
| Un commit por familia, sin checkout anidado | Contador de conexiones del primer caso Native y callbacks sobre la `RequestDatabase` original |
| Stop previo y rollback íntegro tardío | Casos Native segundo/tercero, cada uno con pérdida de autoridad y bloqueo de recuperación después de todos sus efectos |
| Resultado incierto sin retry | Cuarto caso Native: commit real seguido de respuesta perdida, causa original, una sola ejecución y nueva pasada explícita sin efectos repetidos |
| Menor necesidad OTP, MAC local y consumo separados | Tres casos Native de `verification-material-maintenance.test.ts`; código validable tras destruir el sobre aceptado, unknown vigente conservado y cuotas sin liberar |
| Deletion/privacy y vínculo mínimo | [Retención privada previa](admission-private-retention-baseline.md): eliminación real de cuenta/tribu, reserva reconocible por HMAC, archivo y purga por fecha original. El SQL de esos owners permanece sin cambios en esta unidad |
| Documentación y composición disponibles | Dos factories privadas y sus casos de uso, arquitectura, modelo de datos, manual temático e índices actualizados; el driver periódico pertenece a T186 |

Tipos de producto/tests y lint pasan. El build real con dependencias publicadas termina con código cero y sus doce fuentes de producto coinciden con el target. La revisión inicial encontró un P2 de clasificación de recovery envuelto por un leaf; se verificó y corrigió fuera de ese catch. La revisión final de veintiún archivos queda sin hallazgos ni drift, manifest SHA256 `64ebae52a54e1fb1cbf4441a64851797e142dc111b3145c727df060b13d31d6e`.

Arquitectura, manual, menú e índice detallado pasan dieciséis vistas Chromium/WebKit a 390/1280 px, enlaces locales, recarga con ancla, hoja del índice y regreso al menú. Dos capturas móviles se inspeccionan visualmente; no hay desbordes ni errores JavaScript. Los dos manuales numerados pasan el checker sin errores. Conservan advertencias explicadas de documentos locales y ausencia de catálogo central; ambos scripts de navegación coinciden con el bloque canónico de Heritage, aunque el extractor del checker emita su falso positivo. No hay pantalla nueva de producto ni capturas de aplicación simuladas.

La metadata final de Neon confirma sólo producción y el piloto conservado. Todas las ramas efímeras de estas pruebas ya están ausentes. La copia de build fue archivada por el gestor y el estado `archived_worktree` quedó confirmado. No se modifica el piloto, sus protecciones ni sus recibos; no hay envíos externos nuevos.
