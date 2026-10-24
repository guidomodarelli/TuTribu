# Cierre funcional de bandeja, preferencias y avisos

## Estado y procedencia

Se completan exclusivamente **T178, T179, T189, T190 y T191**, con sus **48 cláusulas originales**: ocho, nueve, doce, once y ocho. El inventario queda en **196 tareas completas, 16 pendientes y 212 totales**, con **71 temáticas aprobadas**. Las descripciones, dependencias y referencias normativas se conservan íntegras. Quedan T106 y T198–T212; el objetivo global continúa activo.

La revisión Codex del producto de 144dd8427e9a55e508cf44688fe8d5511795c099 y sus documentos de cierre terminó con **cero hallazgos accionables y 387 inputs estables**. El dictamen privado es .git/codex-us8-ui-docs-and-final-acceptance-review.json, SHA256 bfb62e46b339d949c77857a54401b7655b8e8950743cd0945933c0d1ed94b182. Revalidó también los [tres cierres anteriores](batch-notification-refresh-completion.md) y los cinco manuales modificados.

## Alcance completo de las cinco tareas

| Tarea | Cláusulas | Evidencia y límites |
| --- | --- | --- |
| T178 | 8 | Mantenimiento protegido y acotado, catch-up, ausencias visibles, cuota/preferencia/rol actuales, resultados mixtos y refresco funcional. El caso de cuota real pendiente se repitió con el adapter actual y pasó; no se infiere operación saludable de un cronfile. |
| T179 | 9 | Selección visible hasta cincuenta, confirmación nominativa, estados mixtos e inciertos, progreso y recuperación; preferencias/correo y avisos propios sin membresía, entrada única de datos y cancelación sin feedback obsoleto. Contratos, componentes reales y los ocho casos de interfaz actuales sustentan el recorrido. |
| T189 | 12 | Filtros, selección, confirmación y resultado individual; motivos internos y externos separados, correo/preferencia/entrega, recordatorio y actividad. Beez-ui real, originales conservados y detención de consultas al quedar terminal, sin incorporar filas ocultas ni repetir éxitos. |
| T190 | 11 | Arquitectura propietaria, manuales temáticos e índices, fuentes y CHANGELOG Unreleased coinciden con los recorridos alcanzables. Un párrafo obsoleto de generación de grupos quedó corregido; activación, mediciones y entrega externa siguen pendientes. Capturas y fechas se conservan. |
| T191 | 8 | Los seis AC se contrastaron con SQL, lotes, centro y UI reales, caída de correo, recomposición y cambios de rol. El refresco contextual tiene evidencia funcional; OG-05/SC-015 mantienen el driver saludable y las mediciones operativas pendientes. |

## Seis escenarios de aceptación

| AC | Resultado observado |
| --- | --- |
| US-08-AC-01 | La bandeja y los avisos propios siguen disponibles con correo externo deshabilitado o sin configurar. |
| US-08-AC-02 | Grupos, calendario diario, preferencia y contenido actual están acreditados con dedupe y transporte controlado; no se afirma recepción externa. |
| US-08-AC-03 | Presentación pendiente y rechazo real conservan el hecho y la obligación ante SDK 503; recomponer el procesador no genera otro POST. |
| US-08-AC-04 | El lote explícito revalida IDs/versiones, conserva resultados individuales y conflictos, y recupera su original sin repetir decisiones. |
| US-08-AC-05 | Abrir un enlace no decide; lectura y escritura comprueban la audiencia y el rol actuales, incluida su revocación. |
| US-08-AC-06 | La admisión automática figura en actividad y métricas sin crear una revisión manual ni su correo por defecto. |

## Ejecuciones actuales

- **Interfaz: ocho casos aprobados, cero fallos y cero omitidos, en dos archivos.** Cuatro matrices de bandeja y cuatro de preferencias ejercitan Chromium/WebKit a 390/1280, con SQL, sesiones, Next y beez-ui reales. Los 3.603 inputs permanecieron estables; 3.081 inputs de runtime correspondían al checkout actual, sin diferencias inexplicadas. Los cuatro resultados de bandeja terminaron sin errores JavaScript. El recibo privado es .git/codex-us8-ui-current-final-proof.json.
- **Cuota en cola: un caso aprobado, cero fallos y seis fuera del filtro, en un archivo.** La política real se reduce a cero antes del marker: queda quotaDeferred, sin llamadas SDK, intentos o reservas, y se conserva el código y el original. La precisión P3 del resumen se corrigió: un archivo y dos suites; no se repitió el Native por ese contador. El recibo es .git/codex-us8-quota-current-final-proof.json.
- **Documentación: doce vistas y cuatro recorridos nuevos, 127 destinos locales y cero errores.** Manual específico e índices se comprobaron en ambos motores y tamaños. Ocho vistas de los otros dos manuales se reutilizan mediante sus hashes originales y equivalencia de cambios sólo en metadatos; tres documentos propietarios conservan sus bytes ya comprobados. Los checkers estáticos terminaron sin errores. Las advertencias corresponden a manuales locales sin URL publicada y ausencia de catálogo central de traducciones. El recibo es .git/codex-us8-documentation-current-proof.json.
- **CI de 144dd842: éxito.** Lint, ambos chequeos de tipos, 5.934 casos aprobados y build real de Next; 317 archivos y 882 casos omitidos por sus gates se conservan como tales. No sustituyen los Native ejecutados aparte. Ejecución: [39026272441](https://github.com/guidomodarelli/TuTribu/actions/runs/39026272441).

Los casos locales, SQL, HTTP y refresco anteriores conservan sus recibos en la [matriz general](notifications-and-scheduler.md). No se vuelven a sumar por aparecer en varias cláusulas. No hubo nuevas capturas DOM de la aplicación en esta repetición: el snippet de captura estaba ausente.

## Recursos y gates

Después de terminar ambas cohortes, Neon confirmó a las **11:10:32 UTC** exactamente las tres ramas originales o ajenas, **cero temporales propias y cero desconocidas**. No se eliminaron ramas adicionales. El cierre privado es .git/codex-us8-ui-and-quota-neon-final.json; la consulta de las 10:04 UTC conserva su carácter histórico.

La implementación y validación funcional de T176–T191 están registradas. **OG-05, SC-015 y RG-08 siguen pendientes** del driver frecuente autorizado, capacidad y mediciones reales: p95 de disponibilidad menor a treinta segundos y aceptación del agrupado dentro de cinco minutos del cierre de ventana. Las pruebas no acreditan recepción externa ni deduplicación del proveedor. No hubo mensajes reales, despliegue ni migración productiva en estas cohortes; los otros gates y las dieciséis tareas restantes conservan su alcance.
