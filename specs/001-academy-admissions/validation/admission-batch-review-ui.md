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
| Comprobación adicional del control de recuperación, con capturas habilitadas, en ambos motores a 1280 | Dos casos aprobados, cero fallos y dos fuera del filtro; 2185 entradas estables |
| Capturas Native con los textos de los controles visualmente estables, en Chromium a 1280 | Un caso aprobado, cero fallos y tres fuera del filtro; 2185 entradas estables |
| Capturas adicionales con respuestas HTTP propias controladas | Un escenario aprobado; cinco variantes de interfaz, sin certificar efectos de base de datos |

Las filas de pruebas de componentes se superponen: el módulo ampliado reemplaza sus 17 casos anteriores. Las tres ejecuciones de regresión y API reúnen 140 casos únicos en nueve archivos; ese agregado no es una ejecución nueva del CI completo. Las pruebas ejercen `beez-ui` y el árbol real de la ruta. Los dobles reemplazan únicamente el puerto HTTP propio. No reemplazan librerías internas, la plataforma ni el validador del contrato público. Los casos comprueban efectos visibles y ausencia de recargas completas de la ruta.

La primera matriz Native se detuvo después de que el escenario de revisión concurrente de Chromium a 390 píxeles no completara su comprobación. Se eliminó la rama temporal interrumpida después de verificar su propiedad; las tres ramas originales se conservaron. La reproducción acotada incorporó sólo etapas y códigos HTTP públicos, sin registrar cuerpos, contactos ni cookies. El ensayo separa la confirmación concurrente, la respuesta del lote y su presentación, conservando los límites ordinarios por respuesta y por caso.

La matriz principal final completó los cuatro escenarios con Next, SQL, SDK y relojes reales. Cada caso confirmó una aprobación y un conflicto de un lote; luego confirmó otro lote en el servidor y perdió deliberadamente su respuesta. La recarga recuperó ese original y conservó las dos decisiones aunque fallara la lectura posterior de la bandeja. Se observaron exactamente dos POST de lote, un GET del original y dos cargas del documento, incluida la recarga explícita. La recuperación se detuvo después del resultado terminal; no hubo errores de página ni mensajes externos. Las ramas propias quedaron eliminadas y el inventario final conservó únicamente las tres originales.

La disponibilidad del control de consulta después de terminar la comprobación de identidad se verifica por separado de la confirmación del ledger. Su primera comprobación adicional falló en Chromium a 1280 píxeles: el servidor había confirmado el lote, pero el botón no quedó disponible dentro de los 35 segundos del oráculo. El proceso terminó con un fallo y dos casos fuera del filtro, y se detuvo antes de ejecutar WebKit a 1280. La recarga de la matriz anterior no acredita por sí sola la disponibilidad de ese control.

El diagnóstico posterior, con metadatos de red y sin la herramienta de capturas, pasó un caso de Chromium a 1280; tres quedaron fuera del filtro. El navegador observó el fallo del segundo POST y la consulta posterior de sesión terminó con 200. Una prueba independiente confirmó que el `fetch` nativo rechaza el corte y que la lectura HTTP de sesión responde; no ejerció la recuperación de la UI ni su SDK. La revisión de nueve fuentes y cinco recibos estables no identificó una causa de código confirmable. El fallo anterior permanece registrado y no se declara corregido por una repetición exitosa.

La comparación posterior con capturas habilitadas pasó en Chromium y WebKit a 1280: el navegador observó el corte y pudo consultar el original sin repetir decisiones. Un último caso de Chromium esperó además la eliminación del texto saliente y la opacidad final del texto actual antes de exportar las cuatro capturas. Estas comprobaciones repiten escenarios de la matriz principal; no se suman como casos Native únicos nuevos ni acreditan una corrección del fallo aislado. Conservan los límites originales por respuesta y por caso.

Las capturas con respuestas controladas documentan estados de interfaz; no sustituyen los resultados de la matriz con persistencia real. Las capturas del manual deben esperar también a que finalice la transición visual del texto del botón, además de comprobar que el control esté habilitado.

## Manual y validación de navegación

Los manuales de admisiones y operaciones internas y sus dos índices registran el código `a6510aa6`, posterior al commit funcional `a93e3180`. El tema contiene 69 marcos: conserva el HTML y el orden de reglas de los 60 anteriores y añade nueve capturas de lotes. De las anteriores, 59 son históricas y una corresponde al estado propio del incremento previo. Las nueve nuevas separan cuatro capturas Native de cinco variantes con respuestas propias controladas. El recorte de la lista de cincuenta se identifica en su explicación; no representa una selección implícita de filas ocultas.

Los validadores estáticos de ambos manuales y del índice detallado terminaron sin errores. Mantienen sólo las advertencias por documento local sin URL pública y por ausencia de catálogo central de traducciones. Las tres ramas originales de Neon permanecen presentes; las de estos ensayos quedaron eliminadas por sus propietarios.

Las primeras ejecuciones de navegación se conservan como fallidas, sin sumarlas a una cohorte aprobada. La reproducción en WebKit identificó un desplazamiento entre `pointerdown` sobre el enlace y `pointerup` sobre otro elemento: el `click` terminó en `BODY`, sin activar el enlace. El lector canónico todavía estaba alineando el salto de sección. El chequeo ahora espera el destino dentro del viewport, sus fuentes y la ventana de alineación de 2500 ms, que cubre los 900 ms de fallback y los 1500 ms de ajuste del lector fijado para este manual. No cambia documentos para evitar la comprobación, límites de producto ni relojes.

La matriz ampliada final pasó 32 vistas y doce recorridos independientes con puntero, Chromium/WebKit a 390/1280. Los 414 enlaces locales tienen destino y ancla disponibles. No hubo desbordes, errores de página ni fallos de marcos, marcadores u orden. Cada recorrido llegó desde un índice al lote, siguió hacia los avisos y conservó el ancla al recargar. Se inspeccionaron las capturas de escritorio Chromium y móvil WebKit. Los checks iniciales fallidos y las reproducciones diagnósticas permanecen separados de esta matriz; no son casos nuevos de aplicación ni mediciones de latencia.

La revisión detectó tres descripciones antiguas de disponibilidad en el menú, el índice y operaciones internas. Quedan sincronizadas con la selección y confirmación disponibles en la bandeja y enlazadas al mismo recorrido. Operaciones internas conserva su esquema original identificado como tal y registra también el código probado.

El [CI del commit funcional `a93e3180`](https://github.com/guidomodarelli/TuTribu/actions/runs/39008287298) pasó lint, tipos, 5893 casos en 550 archivos y la compilación de 56 páginas. Los 878 casos y 314 archivos omitidos conservan sus pruebas Native separadas. Ese CI acredita su propio commit; el cambio posterior del helper de capturas y el cierre documental mantienen su comprobación independiente.

## Límites de esta evidencia

Esta evidencia no cierra T179 o T189 ni sus dependencias. Preferencias, capacidad y estado del correo, recordatorios y actividad conservan su alcance original. Tampoco certifica p95, SC-015, recorridos integrales ON/OFF, programación ni entrega mediante un driver real.

En particular, FR-119 sigue sin una distinción específica por antigüedad en las filas de la bandeja: [AdmissionReview](../../../components/academy-admissions/admission-review/index.tsx) presenta estado, origen y fecha con el mismo tratamiento de fila; el [DTO de página](../../../src/modules/academy-admissions/application/results/admission-review-page-result.ts) contiene elementos y continuación. La existencia del [productor privado de recordatorios](../../../src/modules/notifications/infrastructure/repositories/postgres-admission-notification-producer.ts) no prueba ese comportamiento visual. Debe verificarse y completarse junto con el recorrido y los límites propios de T179/T189, sin confundirlo con el resultado de un lote.

Los [ensayos del núcleo](batch-decisions-baseline.md), la [API y recuperación](batch-decisions-http.md) y la [elegibilidad](batch-decisions-eligibility.md) conservan sus propias fuentes y alcances. No se reinterpretan como cobertura completa de los seis criterios ni de todas las dependencias de T176/T183.
