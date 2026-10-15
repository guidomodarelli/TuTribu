# Modelo privado de grupos y calendario de admisión

Este incremento parte del guardado privado de preferencias en `13865d0778d1e4c26d72ecc86137c6337ac68dd2`. Conserva las 212 tareas originales: 174 completas y 38 pendientes. No cierra T180, T181, T177, T184, US8 ni T211.

## Reglas implementadas

- Los candidatos de revisión exigen responsables activos y eventos de pendiente o recordatorio. Las resoluciones se limitan a la cuenta solicitante y usan modo individual sin exigir membresía comunitaria. La confirmación pendiente del solicitante conserva su recorrido interno, sin generar correo de revisión para esa cuenta.
- La política consume hechos privados actuales de los owners de correo confiable y capacidad preparada. Prueba el cierre cuando faltan; no implementa todavía esos resolvers ni acepta flags del navegador. Tampoco despacha ni fabrica un permiso durable de envío.
- Los cortes de habilitación y de preferencia conservan microsegundos enteros: el evento anterior por un microsegundo queda fuera. Los defaults reutilizan la política ya implementada de líder agrupado y guardián omitido.
- La ventana de cinco minutos se asigna con el reloj actual de materialización en una grilla UTC. Así el catch-up no modifica un manifest ya cerrado. La identidad individual conserva el evento original aun con otro reloj de materialización.
- El límite de veinticuatro horas parte del evento original. Agrupar o esperar al resumen diario no lo extiende. Una ventana que no entra en ese plazo produce una causa explícita; conservarla duraderamente pertenece al productor pendiente.
- La reevaluación de un grupo existente conserva su ventana y vuelve a comprobar rol, elección, habilitación, ámbito y vigencia. El manifest selecciona referencias ordenadas, separa vencidos y conserva el plazo menor de los restantes; no incluye direcciones, notas, contacto, texto del solicitante, credenciales ni plantilla.
- La condición de recordatorio exige pendiente, tres días transcurridos y ausencia de vencimiento. La unicidad y materialización durables conservan su trabajo pendiente; el predicado no acredita que ya exista un recordatorio guardado.

## Calendario nativo

El port de calendario se ejecuta en la transacción existente. PostgreSQL determina el comienzo y cierre a las 09:00 de la zona configurada; ausencia usa `America/Argentina/Buenos_Aires`, y una zona inválida falla sin fallback. Se separan segundos enteros y resto de microsegundos para no pasar el reloj por Date; el adapter rechaza aritmética fuera del rango entero seguro. Las fechas nativas del producto y de las fixtures están dentro de ese rango.

Se probaron en PostgreSQL el microsegundo anterior al límite, el límite exacto, la zona por defecto, un offset de media hora y ambos cambios de horario de Nueva York: ventanas locales de 23 y 25 horas. El plazo de correo sigue siendo de veinticuatro horas transcurridas, independiente del día local. La semántica de calendario usa los operadores documentados por [PostgreSQL](https://www.postgresql.org/docs/current/functions-datetime.html).

## Validación y límites de la evidencia

Pasaron **27 casos de política en un archivo completo**, sin fallos ni filtros, y **un caso integrado Native completo** que ejerce todas las variantes de calendario y los rechazos por zona inválida/rango no seguro. Son 28 casos disjuntos en dos archivos; las aserciones del caso Native no se cuentan como más tests. Los inputs capturados permanecieron estables.

Los primeros intentos rojos fallaron al cargar los módulos aún inexistentes, con cero casos ejecutados; no acreditan 27 fallos individuales ni ejecución SQL. Los tests actuales no mockean pg, Drizzle, el calendario ni librerías internas. El setup común de Vitest conserva sus polyfills documentados.

La evidencia sanitizada se registra en [admission-notification-groups-results.json](admission-notification-groups-results.json). El CI aprobado del commit de partida corresponde a la persistencia anterior; el siguiente commit requiere su workflow propio. No hubo envíos externos ni cambios de claves, piloto o cuentas reales.

## Trabajo original restante

Faltan grupos durables y miembros únicos, integración con el puerto productor y sus writers originales, recordatorio materializado único, ajustes de correo, resolvers reales de confianza/capacidad, congelado y firma del payload completo de outbox, selección y revalidación al despacho, scheduler, API, UI y mediciones operativas. Este manifest de referencias no equivale al intent completo de un proveedor ni a un permiso de envío.
