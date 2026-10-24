# Recolección de una página con hechos compartidos

Incremento privado parcial de T185 sobre `cfa1164a0d6728563fc4041f2a6e814c930f9ca5`. Se conservan las 212 tareas originales, 181 completas, 31 pendientes y las 71 aprobaciones. T185/T186 y sus gates mantienen todo su alcance.

## Contrato implementado

`PostgresAdmissionNotificationRepository.collectMany` acepta como máximo las veinticinco referencias de una página de la misma tribu, con tuplas originales únicas incluso al variar las mayúsculas del UUID. Rechaza un lote mal formado antes de sus propias consultas o del guard de autoridad. Su caller sigue siendo dueño del checkout y del commit. El contrato singular `collect` delega una entrada.

El owner comprueba autoridad y fence exclusivo de tribu y fija los destinatarios nativos en orden antes de los locks de miembros históricos. Esto conserva un orden que evita buscar una cuenta después de un miembro involucrado en su cascada. La recuperación de un miembro original existente no consulta runtime o identidad: devuelve procedencia, sin acreditar permiso actual de envío. La falta real de una fuente se registra por separado.

Sólo las referencias nuevas comparten cuenta, capturas y rol por destinatario/audiencia exactos. El reader de hechos fija ajustes, preferencias y capacidad seleccionada dentro de la misma llamada y transacción. No expone un argumento de destino confiable, no comparte datos con otra tribu ni cachea permisos entre llamadas.

Cada unidad conserva política, fuente, calendario y reloj actuales después de esperas. El insert mantiene el bucket original y sus checks finales de autoridad, configuración y plazo. Los resultados conservan el orden de entrada y los rechazos de elegibilidad propios; un fallo nativo o de runtime rechaza la operación completa. `PostgresAdmissionNotificationCollectionProgress` confirma esos efectos junto con sus contadores y posición, con replay original y sin retry tras una respuesta incierta.

## Validación observada en este corte

| Comprobación | Resultado | Alcance |
| --- | --- | --- |
| Pruebas locales | 207 aprobadas, cero fallidas y cero omitidas | Nueve archivos completos, sin filtros, 2111 inputs estables |
| Tipos de producto y tests | Correctos | Cuatro archivos del incremento; no sustituye la ejecución Native |
| Lint | Correcto | Tres owners de producto y un test Native nuevo |
| Revisión de código | Cero hallazgos accionables | Cuatro modificados, siete normativos, 42 de contexto y siete recibos estables; no certifica Native activo |
| PostgreSQL de recolección | Seis aprobados, cero fallidos y cero omitidos | Tres archivos completos, sin filtros, 2105 inputs estables; productor consumido |
| PostgreSQL de preparación del grupo | Tres aprobados, cero fallidos y cero omitidos | Un archivo completo, sin filtros, 2103 inputs estables; productor consumido |

Las dos cohortes actuales suman nueve casos Native distintos en cuatro archivos. Junto con los 207 locales forman **216 casos actuales distintos**, por archivo y nombre. Los inputs comunes coinciden y todos los productores fueron consumidos. No se suman los 221 casos del checkpoint anterior.

Los tres casos Native nuevos cubren una página mixta de dos y otra de veinte referencias, reparto independiente por destinatario y escala del puerto propio de runtime; replay histórico con configuración indisponible; máximo, duplicados, mayúsculas, ámbito, vacío y autoridad; borrado real de un solicitante durante una espera observada; y reversión de grupos/miembros tras observar un cambio tardío de época, con colección posterior genuina. Se ejecutan junto a los archivos completos de recolección singular y progreso. Otra cohorte comprueba la preparación real del grupo y sus ventanas originales. Las cohortes completas terminan con cero y conservan sus reportes propios.

Los datos y claves son sintéticos, PostgreSQL y criptografía son reales, no se mockea plataforma ni se envían mensajes reales. El contador del puerto propio excluye los guards finales de cada miembro nuevo y compara trabajo compartido entre páginas del mismo conjunto de destinatarios. No mide consultas SQL, p95 o latencia. El archivo principal pasa de 110 a 123 líneas y el módulo de 4120 a 4195; no se afirma reducción del tamaño total.

## Alcance restante

La [arquitectura de página compartida](../../../docs/architecture/notifications.htm#admission-notification-collection-batch) conserva estos límites. No hay schema, migración, RPC, checkout, retry o recorrido público nuevos; los manuales públicos conservan su flujo. Continúan sender de avisos propio, recuperación funcional auditada, productor protegido, selección entre tribus, mantenimiento, runs, purga y mediciones originales.

El [CI de cfa1164a](https://github.com/guidomodarelli/TuTribu/actions/runs/38927826928) terminó con 536 archivos/5702 casos aprobados, 300 archivos/849 casos omitidos y 55 páginas. Acredita ese checkpoint anterior. El incremento actual conserva sus resultados Native completos y separados. La arquitectura pasa ocho vistas y 96 enlaces en Chromium/WebKit a 390/1280, con recursos heredados iguales; las seis fuentes compartidas de pool/auth/retry permanecen iguales y una nueva búsqueda comprueba ocurrencias hermanas y nueve owners propios. Después de todos los productores, el inventario oficial de Neon confirma cero temporales propias y las tres ramas originales conservadas; las ajenas se preservan según el inventario real. El contraste conjunto registra su dictamen por separado y el checkpoint requiere nuevo CI después de guardarlo y subirlo.
