# Composición de admisión y mensajería

**Feature**: `001-academy-admissions`. **Base**: `dc9479db759481455349aef936573967b2b14a0a`, cambios locales de T047. Composición completada con validación y revisión finales.

## Responsabilidades

Los roots registran únicamente capacidades implementadas. Request recibe provider nativo de cuenta actual, executor guardado y reloj. El colaborador de cuenta dentro de la transacción utiliza el mismo RequestDatabase y vuelve a consultar hechos actuales, sin otro checkout. El resolver de operaciones es sólo lectura del original y exige autorización/schema/security propios; no fabrica progreso ni repite efectos.

Emisión, validación, aplicación de prueba, presupuestos y reader de países se componen con la transacción del caller y authorizers obligatorios. Países sólo consulta la tribu fijada. Mensajería separa contexto selected/candidate, gestión de uso, diagnóstico local, cupo de credenciales y Store humano. Cada checkout sensible conserva usuario/sesión/cuenta; SQL vuelve a autorizar bajo locks.

Trabajo utiliza bearer nativo vivo y executor de mantenimiento, sin sesión humana ficticia. Requiere security/sender/runtime explícitos y revalida autorización al preparar/enviar. SDK real fuera de SQL; no default de keyring, cliente global mutable, cron nuevo o activación de proveedor.

## Regresiones verificadas

La revisión encontró sustitución de sesión del mismo usuario, lectura de países de otra tribu desde colaboradores scoped y pérdida del código de autorización al llegar al executor. Los tres casos se reprodujeron con PostgreSQL real antes de corregirlos. La ejecución posterior pasó seis casos SQL en 200,52 segundos, con cleanup propio verificado.

Un segundo review encontró que el ledger también clasificaba como desconocido el error de acceso antes de reclamar una mutación. El nuevo test reprodujo unexpected_failure donde correspondía authentication_required. El adapter ahora traduce sólo MessagingSecretAccessError, conservando cause; deja intactas las fallas PostgreSQL desconocidas para reconciliación. Las nuevas aserciones comprueban ausencia de claim previo, conservación del original después y ningún cambio de política no confirmado, además de diagnóstico local.

La ejecución final conjunta pasó cinco casos SQL en 99,28 segundos; el sexto falló durante setup por un nombre incorrecto del catálogo de reautenticación. Se corrigió únicamente ese fixture y su ejecución focal pasó en 153,57 segundos (150,78 de test), con todos los escenarios adicionales de mutación/diagnóstico. Los dos skips corresponden al filtro y son casos ya verdes en la ejecución conjunta. Los tres casos de admisión acreditan contexto actual sin checkout anidado, recuperación read-only del original y aislamiento de países; mensajería acredita configuración/CAS/replay, sesión sustituida/revocada, worker sin humano y SDK real fuera de locks. Cada rama propia se eliminó antes de finalizar.

Los 74 locales de usage/dispatcher/boundaries pasaron en 1,63 segundos; tipos de tests y lint verdes. Build normal Node 24.21.0/Next 16.3.4, configuración original y variables sintéticas hacia loopback inaccesible: compilación 32,2 s, tipos 12,4 s, cuarenta páginas. La revisión nativa final cerró con cero hallazgos accionables y diez hashes estables, sin ejecutar SQL o editar. Doce renders de arquitectura en Chromium/WebKit a 390/1280 pasaron sin overflow, errores JavaScript o enlaces locales rotos, con ambos browsers cerrados. No hubo cambio de UI disponible que exija reescribir manuales ajenos.

## Alcance pendiente

No se instalan rutas de admisión, scheduler ni transporte productivo. Las historias y gates operativos conservan todos sus requisitos. No hay migraciones en default/producción o mensajes reales. No se modifican spec.md, technical-contract.md, checklists ni IDs normativos.
