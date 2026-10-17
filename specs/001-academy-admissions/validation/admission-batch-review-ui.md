# Selección y recuperación de decisiones por lote

## Alcance comprobado del núcleo

La bandeja real de líder o guardián permite seleccionar hasta cincuenta solicitudes pendientes ya cargadas, revisar sus nombres, separar motivo interno y mensaje externo y confirmar una decisión explícita. La decisión individual conserva su recorrido. El navegador envía un único body con los IDs y versiones seleccionados, sin los nombres del manifiesto local.

La selección se invalida al cambiar nombre, versión o disponibilidad; no reaparece cuando un nombre vuelve a su valor anterior. Las lecturas iguales conservan el borrador, la confirmación y el foco. La cuenta, el rol, la frescura y el estado incierto siguen bloqueando nuevas decisiones cuando corresponde.

Los resultados completos, mixtos o sin decisiones aplicadas permanecen por solicitud. Una escritura abortada o una respuesta perdida conserva el original para consultar. La recuperación comprueba UUID, namespace, selección y versiones; no repite POST ni fabrica éxitos. Una ausencia confirmada puede habilitar sólo el mismo original con nueva confirmación y lectura actual válida.

## Regresión reproducida y corregida

La revisión detectó `T189-BATCH-P2-01`: al restaurar un original completado, una caída posterior de la bandeja ocultaba el resultado ya recuperado. La reproducción falló exactamente en la región de resultados ausente: cinco casos pasaron y uno falló; once quedaron fuera del filtro.

La corrección habilita la presentación histórica únicamente después de comprobar el viewer y proyectar el original autorizado. La frescura continúa bloqueada. Si la lectura posterior deniega el permiso, se ocultan los nombres y resultados. La regresión también rechaza sustituciones de operación, selección, versión y namespace sin borrar el original pendiente ni volver a enviar.

## Validación ejecutada

| Verificación | Resultado |
| --- | --- |
| Componentes reales, lectura visible y adaptador propio: cuatro archivos | 74 casos aprobados, cero fallos y cero omitidos |
| Regresión ampliada con avisos y solicitud propia: siete archivos | 103 casos aprobados, cero fallos y cero omitidos |
| Casos de uso y rutas de decisiones por lote: dos archivos adicionales | 36 casos aprobados, cero fallos y cero omitidos |
| Módulo de componentes ampliado con dos lotes consecutivos | 18 casos aprobados, cero fallos y cero omitidos; incluye los 17 casos anteriores del mismo módulo |
| Tipos de producto y de pruebas | Aprobados |
| Lint tras retirar un import sin uso | Aprobado, sin advertencias |
| Compilación real de producción con configuración sintética local | Aprobada |
| Segunda revisión Codex del núcleo y revisión del oráculo Native | Sin hallazgos accionables |
| Matriz Native principal: Chromium y WebKit, a 390 y 1280 píxeles | Cuatro casos aprobados, cero fallos y cero omitidos; 2185 entradas de fuente estables |
| Capturas adicionales con respuestas HTTP propias controladas | Un escenario aprobado; cinco variantes de interfaz, sin certificar efectos de base de datos |

Las filas de pruebas de componentes se superponen: el módulo ampliado reemplaza sus 17 casos anteriores. Las tres ejecuciones de regresión y API reúnen 140 casos únicos en nueve archivos; ese agregado no es una ejecución nueva del CI completo. Las pruebas ejercen `beez-ui` y el árbol real de la ruta. Los dobles reemplazan únicamente el puerto HTTP propio. No reemplazan librerías internas, la plataforma ni el validador del contrato público. Los casos comprueban efectos visibles y ausencia de recargas completas de la ruta.

La primera matriz Native se detuvo después de que el escenario de revisión concurrente de Chromium a 390 píxeles no completara su comprobación. Se eliminó la rama temporal interrumpida después de verificar su propiedad; las tres ramas originales se conservaron. La reproducción acotada incorporó sólo etapas y códigos HTTP públicos, sin registrar cuerpos, contactos ni cookies. El ensayo separa la confirmación concurrente, la respuesta del lote y su presentación, conservando los límites ordinarios por respuesta y por caso.

La matriz principal final completó los cuatro escenarios con Next, SQL, SDK y relojes reales. Cada caso confirmó una aprobación y un conflicto de un lote; luego confirmó otro lote en el servidor y perdió deliberadamente su respuesta. La recarga recuperó ese original y conservó las dos decisiones aunque fallara la lectura posterior de la bandeja. Se observaron exactamente dos POST de lote, un GET del original y dos cargas del documento, incluida la recarga explícita. La recuperación se detuvo después del resultado terminal; no hubo errores de página ni mensajes externos. Las ramas propias quedaron eliminadas y el inventario final conservó únicamente las tres originales.

La disponibilidad del control de consulta después de terminar la comprobación de identidad se verifica por separado de la confirmación del ledger. Las capturas con respuestas controladas documentan estados de interfaz; no sustituyen los resultados de la matriz con persistencia real.

## Límites de esta evidencia

Esta evidencia no cierra T179 o T189 ni sus dependencias. Preferencias, capacidad y estado del correo, recordatorios y actividad conservan su alcance original. Tampoco certifica p95, SC-015, recorridos integrales ON/OFF, programación ni entrega mediante un driver real.

En particular, FR-119 sigue sin una distinción específica por antigüedad en las filas de la bandeja: [AdmissionReview](../../../components/academy-admissions/admission-review/index.tsx) presenta estado, origen y fecha con el mismo tratamiento de fila; el [DTO de página](../../../src/modules/academy-admissions/application/results/admission-review-page-result.ts) contiene elementos y continuación. La existencia del [productor privado de recordatorios](../../../src/modules/notifications/infrastructure/repositories/postgres-admission-notification-producer.ts) no prueba ese comportamiento visual. Debe verificarse y completarse junto con el recorrido y los límites propios de T179/T189, sin confundirlo con el resultado de un lote.

Los [ensayos del núcleo](batch-decisions-baseline.md), la [API y recuperación](batch-decisions-http.md) y la [elegibilidad](batch-decisions-eligibility.md) conservan sus propias fuentes y alcances. No se reinterpretan como cobertura completa de los seis criterios ni de todas las dependencias de T176/T183.
