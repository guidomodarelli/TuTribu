# Lectura agrupada de identidad del destinatario

Incremento privado parcial de T185 sobre `b7b42a22657dbfb0e3520e08e64af3c20e4413b3`. Se conservan las 212 tareas originales, 181 completas, 31 pendientes y las 71 aprobaciones temáticas. No se cierra T185 ni T186.

## Comportamiento y decisiones

El reader de correo comparte la cuenta actual, sus capturas de identidad y el rol para las fuentes de una misma tribu, destinatario y audiencia, dentro de la transacción autorizada existente. La preparación y la autoridad del grupo consumen ese lote. La lectura individual conserva su contrato y delega una única obligación.

Las solicitudes, obligaciones y avisos se bloquean en orden mediante arrays nativos y se vuelven a leer después de las esperas. Cada fuente conserva su relación original y recibe su propia evaluación de confianza. La prueba local aplicada permanece ligada a su solicitud; los grupos de revisores comparten la identidad sin repetir una lectura por miembro. No se cachean permisos entre transacciones ni se aceptan direcciones o flags del navegador.

El runtime local se lee una vez por lote no vacío con fuentes y cuenta existentes. Una entrada vacía no consulta ese puerto. Las fuentes ausentes o denegadas no tienen destino; un fallo nativo o del runtime rechaza la operación completa, sin entregar un mapa parcial. Se conservan los locks restantes del grupo cuando falta una cuenta confiable. No se añaden checkout, RPC, retry, schema de filas PostgreSQL, almacenamiento de contactos ni cambios de estructura.

## Validación observada

| Comprobación | Resultado | Alcance |
| --- | --- | --- |
| Pruebas locales | 207 aprobadas, cero fallidas y cero omitidas | Nueve archivos completos, sin filtros, 2110 inputs estables |
| PostgreSQL de identidad | Cinco aprobadas, cero fallidas y cero omitidas | Dos archivos completos, sin filtros, 2103 inputs estables; productor consumido |
| PostgreSQL de grupos | Nueve aprobadas, cero fallidas y cero omitidas | Cinco archivos completos, sin filtros, 2106 inputs estables; productor consumido |
| Tipos de producto y tests | Correctos | Incluye los tests nuevos; no sustituye su ejecución |
| Lint | Correcto | Tres archivos TypeScript del incremento |
| Revisión de código | Cero hallazgos accionables | Tres modificados, siete normativos, 34 de contexto y siete recibos estables; no certifica Native activo |

Las dos cohortes Native actuales suman catorce casos distintos en siete archivos completos. Junto con los 207 locales forman **221 casos actuales distintos**, por archivo y nombre, con inputs comunes idénticos. La cohorte de grupos conserva preparación, snapshots y material protegido, autoridad de todos los miembros, opt-out antes y después del marker y restauración de material bajo el mismo keyId. No se suman los 223 casos del checkpoint anterior a este total.

Los dos casos Native nuevos comprueban resultados de un lote de dos y otro de mil fuentes, con una lectura del puerto propio de runtime en cada llamada; entrada vacía, tribu ajena y cero outboxes; eliminación real del segundo solicitante, con 999 fuentes actuales; e invalidación de captura y pérdida de rol durante dos esperas de locks observadas. Los otros tres casos son la regresión completa del reader individual, incluida su prueba local histórica. Son cinco casos, no mil casos de prueba.

Las pruebas utilizan PostgreSQL y criptografía reales con datos sintéticos y transporte externo cerrado. El contador del puerto propio no mide consultas SQL ni latencia. No se envían mensajes reales ni se utiliza una nueva credencial.

El archivo principal pasa de 104 a 126 líneas y el módulo de notificaciones de 4100 a 4120. El cambio agrupa lecturas compartidas; no reduce el tamaño total ni acredita SC-013/SC-015. La arquitectura documenta el [contrato privado agrupado](../../../docs/architecture/notifications.htm#admission-notification-recipient-batch).

## Alcance pendiente

La recolección de páginas de veinticinco fuentes aún invoca la lectura individual y requiere su siguiente revisión. Continúan pendientes sender propio de avisos, recuperación funcional auditada del grupo, productor público, mantenimiento protegido, fairness, runs, purga y mediciones originales. El incremento no modifica un recorrido público o sus manuales ni representa un cierre integral de US8.

El [CI de b7b42a22](https://github.com/guidomodarelli/TuTribu/actions/runs/38919737291) terminó correctamente: 536 archivos y 5702 casos aprobados, 299 archivos y 847 casos omitidos, y 55 páginas. Acredita ese checkpoint anterior; el incremento actual requiere su propio control después de guardarlo y subirlo. La documentación actual pasa ocho vistas y 91 enlaces locales en Chromium y WebKit a 390/1280; conserva los recursos heredados, sin afirmar disponibilidad offline. La revisión de owners compartidos confirma seis fuentes de pool, auth y retry sin cambios, con búsqueda nueva de ocurrencias hermanas. Tras terminar todos los productores, el inventario oficial de Neon confirma cero temporales propias y las tres ramas originales conservadas; las ajenas se preservan según su inventario real. El contraste conjunto de código, documentación y evidencia registra su resultado por separado.
