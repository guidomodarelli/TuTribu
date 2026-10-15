# Configuración reconstruible y archivo de los owners de auditoría

Incremento de T169/T170 sobre `d9db34c39e62da10ed836a48924ecb2f00168898`. Conserva las 212 tareas originales, 167 completadas y 45 pendientes. Este registro no cierra la matriz integral de T167/T169/T170 ni la interfaz, programación o gates operativos.

## Brecha encontrada y cambio

Los eventos ordinarios de política guardaban actor, recurso, operación y versión con metadata vacía. La política conserva únicamente su estado actual, por lo que no podían reconstruirse sus valores anteriores y nuevos. El constructor ahora selecciona los once campos propios del estado bloqueado anterior y del efecto persistido, con `fromPolicy` nulo sólo al inicializar y `previousVersion` explícita. Deriva recurso/versión de la política real y captura la fecha de activación sin retener el Date mutable del caller. No copia cuerpo de comando, identidad de contacto, claves, notas ni labels arbitrarios.

El writer de inicialización, edición, activación y pausa muestrea un reloj SQL para el recurso y el hecho de auditoría. Mantiene autorización, recencia, CAS, marker, checks de preparación y commit originales. Conflicto, no-op y replay no agregan otro hecho; respuesta perdida conserva la operación original. Una respuesta histórica no sobrescribe una política posterior.

La proyección pública selecciona de nuevo los campos anidados y valida únicamente su DTO propio. No valida filas PostgreSQL ni respuestas SDK como input. Los registros legacy sin snapshots conservan esa ausencia, sin inferir sus valores desde la configuración actual. El acceso administrativo sigue limitado al líder actual y a su tribu.

## Archivo privado

La migración idx169 conserva metadata permitida de solicitudes, lista, invitaciones, uso, conexiones, pertenencias, exposición, protección, pruebas y políticas antes descartada en el archivo. Selecciona también los campos anidados de política y mantiene nulos explícitos, referencias y fechas originales. Causas reconocidas permanecen como códigos; las desconocidas se minimizan. Las ramas acotadas de delivery/proof/notification/retention mantienen su proyección y la recuperación conserva además sus diez referencias/transiciones originales. Los helpers nuevos tienen ejecución privada y no leen claves ni conceden permisos.

El archivo mantiene sus asociaciones opacas, la autoridad del namespace retirado y el plazo original de 365 días. Una fila archivada no autoriza lectura pública ni revive una versión retirada. Notas correctivas libres no se agregan a la metadata minimizada ni a métricas.

## Evidencia inicial

La prueba del constructor se escribió antes del cambio y conservó el reporte rojo por metadata vacía. Después, 21 casos locales pasaron; la ampliación de proyección/HTTP registra 42 aprobados, sin fallos ni filtros. Tipos de producto/tests y lint pasan.

El primer Native aprueba la cadena real de inicialización, update con commit perdido/replay, activación, pausa, lectura administrativa y métricas, replay histórico y no-op sobre la versión reciente, igualdad SQL de reloj entre recurso/audit y DELETE físico con snapshots archivados idénticos. Comprueba también selección privada de campos y eliminación de extras en ambos niveles. Ejecuta un caso de su filtro; los dieciocho casos fuera de ese filtro no se acreditan desde ese reporte.

La revisión inicial de sólo lectura de 13 archivos no encuentra hallazgos accionables y confirma hashes iniciales/finales, manifest SHA256 `b8da10e5ace8b246ce32639ae8eabb6f064dbb78be3519307b606b2dcea9e1d7`. La ampliación posterior a catorce fuentes identifica un P2: la causa cerrada de la recuperación se perdía al pasar por el mapper general de delivery. El Native directo del helper no ejercía ese CASE, por lo que se añade la recuperación real seguida de DELETE. Ninguna revisión acredita por sí sola ejecución, build o tareas padre.

Las regresiones Native registran once aprobados para secuencia, lectores, retención privada y retiro; la matriz de autoridad de política registra cinco aprobados y catorce casos fuera del filtro. La proyección SQL ampliada y el replay de las 69 migraciones registran dos aprobados. Se conservan los reportes separados: una repetición de migraciones no se suma como otro caso distinto.

El build real de Next termina con exit 0 y sus siete fuentes de producto coinciden por hash con el árbol actual. Los cambios SQL posteriores y el fixture de integración no se acreditan como código compilado por ese build. La documentación pasa dieciséis vistas en Chromium/WebKit a 390/1280, con enlaces, anclas, navegación y ausencia de desbordes; los checks de manual mantienen cero errores y las advertencias locales conocidas.

La ampliación de recuperación seguida de borrado conserva sus reportes rojos: el primero agotó el límite antiguo de treinta segundos durante la preparación; la repetición acotada llegó al DELETE real. El diagnóstico PostgreSQL posterior identificó `23502` en `academy_admission_decisions.policy_version`: el fixture no tenía política viva ni snapshot original. Se corrige la preparación con `createPendingAdmissionRequest` y los seis campos que persiste el writer real, sin relajar la restricción ni las aserciones de borrado/archivo. La repetición coherente confirma el fallo de producto `23503`, constraint `messaging_delivery_recovery_operation_fkey`: el delivery sobrevivía al cascade de su operación viva.

## Procedencia de recuperaciones después del borrado

La migración idx170 añade únicamente el par privado `(operation_id,tribe_id)` de recuperaciones retenidas, ligado al namespace estable. El backfill procede de operaciones vivas completadas del mismo actor y alcance. Una inscripción nueva fija la tribu y la operación viva; el guard diferido mantiene los requisitos completos de original, operación y auditoría. La identidad no puede cambiar. El DELETE de la operación sigue protegido mientras exista la tribu, y el cascade físico exige la copia archivada exacta. La referencia mínima se elimina sólo después del último delivery que la necesita. No contiene actor, credenciales, contacto, payload ni otra copia ejecutable del ledger.

La integración compuesta y la secuencia inicial de setenta migraciones registran dos aprobados y cuatro casos fuera del filtro. Comprueban el historial original/archivado idéntico, incluida la causa cerrada de recuperación; la operación archivada idéntica en todos sus campos conservados; el child cancelado con lineage intacta; ausencia del ledger ejecutable; consumo/reservas/intentos sin reset; identidad, FK y ACL privadas; rechazo de una nueva recuperación desde el archivo y liberación de la referencia al purgar el child. Sus funciones y modelos siguen iguales después del ajuste exclusivo de locks del cutover.

El Native separado de actualización conserva su rojo por una aserción de wrapper: el guard diferido de COMMIT entrega `code=23514` en raíz desde `pg`, no bajo `cause` de una query Drizzle. Corregida esa expectativa, la actualización de una recuperación existente pasa; el commit sin auditoría revierte también la referencia; FORCE RLS oculta el registro incluso con grants de tabla y rechaza escritura ajena. No se aflojan las restricciones de producto.

La revisión siguiente identifica un P2 de concurrencia: un lock inicial compatible con `ROW SHARE` se podía bloquear al elevarse para el DDL. El cutover ahora fija de entrada tribu, namespace, operaciones y entregas en `ACCESS EXCLUSIVE NOWAIT`. La matriz Native final registra **cuatro aprobados, cero fallos, cero filtros**: actualización existente y rollback, writer primero, migración primero, y comando real de setenta migraciones con replay. El primer orden recibe `55P03`, conserva el schema anterior y permite repetir el comando tras terminar el writer. El orden inverso observa `pg_blocking_pids` y deja terminar a ambos owners después del commit. Los gates rechazan temprano si termina un owner y liberan/esperan todas las transacciones en `finally`.

El build ampliado termina con exit 0 y diez fuentes de producto coincidentes por hash; tipos de producto/tests y lint pasan. Las pruebas anteriores de política y los 42 locales se reutilizan por fuentes y comportamiento sin cambios, sin acreditar otra vez casos repetidos. La revisión final de sólo lectura cierra el P2 y registra cero hallazgos accionables, con 22/22 hashes estables al inicio y al final: manifest SHA256 `577c9806c9dc79b435c7f5730b4604a4b1954a772a7af5c447165966e66b3864`. El QA documental final aprueba dieciséis vistas de arquitectura, manual, menú e índice detallado en Chromium/WebKit a 390/1280; se inspeccionan capturas reales del documento móvil y se conservan enlaces, anclas, navegación y ausencia de errores/desbordes.

No hay cambios de hosting, envíos externos, renovación de claves del piloto ni intervención sobre producción o la rama del piloto conservado. El incremento conserva T169/T170 abiertas hasta resolver la integración y sus criterios restantes.
