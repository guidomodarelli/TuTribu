# Recolección atómica y progreso privado de una página

## Alcance y responsabilidad

Avance parcial de T185 sobre `24ae7e1f12f88f43c1e126b5bdfdf4f984a4f338`.
Las 212 tareas conservan 181 completas, 31 pendientes y 71 aprobaciones.
No se completa una tarea o criterio por este incremento.

El nuevo puerto conserva un comando privado con UUID y versión esperada.
Su adapter ejecuta el reader finito y el collector existentes bajo el
commit original: fence de tribu antes del checkpoint, permiso actual,
configuración externa vigente y una sola página de hasta veinticinco.
Los miembros y el avance se confirman juntos. Una supresión, historial
existente, referencia ausente o bucket cerrado tiene contador propio y no
reinicia la primera posición. Los errores revierten el conjunto y se
propagan con código controlado y causa privada; no hay retry automático.

`20261016115101_persist_admission_notification_collection_progress.sql`
y la proyección modular mantienen una fila por tribu viva, con posición
nativa completa, versión y último resultado. Hay RLS forzada, ACL privada,
identidad fija, cursor coherente y monotónico, contadores conciliados y
reloj nativo posterior a esperas. La lectura de progreso no inicializa la
fila. La FK elimina este checkpoint con la tribu y no afecta la procedencia
retenida del outbox.

Sólo el último comando confirmado conserva su resultado recuperable. Su
repetición original devuelve los mismos contadores y reloj con replay;
otro contenido para ese UUID se rechaza. Los comandos anteriores conservan
su versión esperada original y fallan cerrados cuando el checkpoint ya
avanzó. No se presenta esta fila de tamaño constante como ledger de todas
las páginas o runs. Tras una respuesta perdida se consulta el progreso
actual; no se crea otra mutación a ciegas.

## Validación actual

Pasan **87 locales en tres archivos completos**, sin fallos u omitidos,
con 2086 inputs estables; tipos de producto/tests y lint completo pasan con
Node 24.21.0. La primera cohorte completa terminó **2 aprobados / 1 fallo**:
pasaron ambos escenarios nuevos de progreso y rollback; falló la creación
de una solicitud en el collector anterior. No se presenta como tres/cero.

`pg` directo reprodujo **SQLSTATE 23514**, constraint
`admission_request_time_check`, tabla `academy_admission_requests`, en el
noveno intento del fixture original. Inicio y vencimiento usaban dos
lecturas del reloj y podían superar por microsegundos el máximo de treinta
días. El control con un solo instante pasó y toda la transacción se
revirtió. La prueba temporal fue retirada tras comprobar su hash y no se
cuenta como cobertura de producto.

Se corrige sólo `createSource` del test anterior: un CTE materializado toma
el reloj nativo una vez y lo reutiliza en inicio y vencimiento. La regla
de producto y las expectativas se conservan. Doce de los trece archivos
de código/fixtures mantienen sus hashes; la única corrección es ese test.
Tipos y lint completos vuelven a pasar. Los 2086 inputs de los 87 locales
siguen idénticos. La cohorte corregida repite **los dos archivos completos y
los tres casos: 3 aprobados / 0 fallos / 0 omitidos**, con **2085 inputs
estables**. Terminó el 16 de octubre de 2026 a las 12:35:41 UTC y fue
consumida con cero. Son **90 casos actuales distintos**, sin sumar intentos
anteriores o el diagnóstico temporal.

El escenario de avance prepara recursos sintéticos de correo con almacenamiento
y criptografía reales, evidencia de confianza ligada al actor y guardián omitido. Compite por el mismo
comando, continúa desde otra transacción, introduce hechos posteriores al
límite y comprueba otra ventana sin duplicar miembros. El owner sintético
puede perder una respuesta después de un commit PostgreSQL real; el test
consulta el resultado y repite el mismo comando, sin otro efecto.

El segundo escenario observa el checkpoint y un miembro escritos antes de
denegar permiso o cambiar la época externa al final: exige rollback de
ambos. También comprueba RLS con grants adversos, invariantes de la fila y
retiro físico de la tribu. Los callbacks de fallo son puertos propios sobre
SQL real; no se mockean librerías de plataforma, base, UI, SDK o crypto.

La preparación común de conexión se extrae sin cambiar sus valores; el
collector original se vuelve a ejecutar completo. La solicitud pendiente
histórica del fixture de correo recibe el snapshot real al crearse, como
las otras solicitudes nuevas; no se modifica un original persistido.

## Límites conservados

El checkpoint no es permiso de despacho ni estado global de cola vacía.
Completar un recorrido permite iniciar otro; cada fuente y grupo siguen
requiriendo hechos actuales y sus vencimientos originales. No se prepara
un subject/body completo, se congela outbox ni se envía correo.

Siguen pendientes la composición protegida de mantenimiento y su selección
justa entre tribus, registro de runs, freeze atómico con intent completo,
recuperación funcional de grupos y preparación/sender. No hay endpoint,
scheduler, flujo público nuevo o configuración de hosting cambiada.
La [arquitectura](../../../docs/architecture/notifications.htm#admission-notification-collection-progress)
conserva estos límites.

El [CI exacto de la base](https://github.com/guidomodarelli/TuTribu/actions/runs/38895897871)
terminó aprobado y fue consumido: 533 archivos/5627 casos, 293 archivos/836
casos omitidos y 55 páginas. No acredita esta migración o su futuro commit.
La arquitectura pasa cuatro vistas y 32 enlaces en ambos motores a
390/1280, con fuentes estables y recursos externos heredados conservados;
no se afirma funcionamiento sin red. La revisión del código corregido
termina sin hallazgos; el contraste conjunto final conserva su recibo
propio. La auditoría oficial posterior a todos los productores confirma
**cero ramas temporales propias y las tres originales conservadas**. El
nuevo checkpoint requiere su CI propio.
