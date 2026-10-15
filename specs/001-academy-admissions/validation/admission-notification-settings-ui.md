# Pantalla de preferencias y correo de admisión

Incremento posterior a `d8ad90464ad5f0c85dc6f28c203277c643c7cffb`. Pasaron **102 casos distintos en nueve archivos completos**: 95 locales, tres Native de repositorio/lector y cuatro Native de navegador. El build real aislado aprobó 1765 archivos de producto equivalentes y la generación de 53/53 páginas. El inventario conserva 212 tareas: 174 completas y 38 pendientes; este incremento no cierra T184, US8 o T211.

## Contrato implementado

La hoja `/<slug>/academia/admissions/notifications` tiene carga y error propios y resuelve sus inputs dentro de Suspense. Una única carga SSR reúne DTOs mínimos de cuenta y tribu vigentes, sin loopback HTTP. El primer HTML y la hidratación usan el mismo snapshot y no duplican el GET inicial de ajustes si no hay un original por recuperar. El guardián recibe sólo su preferencia; el líder recibe por separado la lectura autorizada del correo. La bandeja revisora y la configuración enlazan a esta pantalla.

Los cuatro handlers conservan su body mínimo y vinculan la respuesta con su viewer nativo mediante el encabezado privado común. El navegador comprueba esa metadata y la identidad actual antes y después de los awaits. El body nunca suministra cuenta, rol ni destinatario. Las continuaciones comprueban el slot vigente y su señal después de aceptar cada respuesta antes de modificar datos, visibilidad o storage.

La frecuencia personal usa CAS. Un HTTP 200 con `status: rejected` conserva el conflicto conocido y no anuncia guardado. Una respuesta perdida exige consultar la versión actual antes de otra escritura, conserva la selección local y no inventa un UUID durable. La frecuencia puede guardarse con estado actual comprobado aunque un cambio independiente de correo siga pendiente.

El correo del líder exige confirmación reciente de su propósito, casilla nueva, versión, habilitación, zona y UUID. El comando exacto se persiste por viewer/slug antes del transporte; un fallo de storage impide enviarlo. Editar desmarca la casilla y limpia feedback anterior. Recuperar un body nunca restaura consentimiento ni Google. Una finalización nueva aplica el resultado mínimo; un histórico o replay consulta los ajustes actuales por separado antes de actualizar el borrador y anunciar recuperación.

Una respuesta incierta conserva el original y bloquea un cambio distinto de correo. Después de consultar el original y los ajustes actuales, ausencia o started permiten reintentar explícitamente el mismo UUID y body con una casilla nueva. El GET no reclama ni renueva el lease. El POST DB-only vuelve a comprobar autoridad y recencia: conserva started con lease vigente, continúa un claim vencido y devuelve el histórico de uno completado. La huella del comando impide cambiar su contenido y los efectos se confirman en una sola transacción.

Una escritura denegada por autoridad, sesión o recurso oculta el snapshot anterior, conserva el original enviado y limpia el mensaje viejo que podría tapar la causa actual. Una lectura posterior puede recuperar sólo la frecuencia del guardián sin consultar ni borrar el original privilegiado. Obtener liderazgo inicializa sus campos mediante una lectura autorizada. Un cambio de cuenta oculta los formularios y no consume el original de otra identidad.

Google se prepara únicamente mediante una acción explícita, con `update_admission_email_settings`, tribu, recurso y retorno exactos. Preparar la intención no inicia OAuth ni vuelve a guardar. Un slot cancelable y un guard síncrono impiden escrituras simultáneas; cleanup, Activity y bfcache cancelan lecturas anteriores. Abortar un POST no afirma rollback ni borra su referencia. Las mutations no fuerzan una recarga de ruta.

## Validación disponible

| Control completo | Resultado observado | Alcance |
| --- | --- | --- |
| Siete archivos locales | 95 aprobados, cero fallos y cero omitidos; inputs estables | Aplicación, carga SSR, HTTP propio, transporte, storage y 31 interacciones con beez-ui y Next reales. Doubles sólo en puertos propios. |
| Repositorio/lector Native | Tres aprobados, cero fallos y cero omitidos; 2014 inputs estables | Histórico sin recencia nueva, autoridad actual, GET de started sin renovar, claim vigente/vencido, body distinto rechazado y un único efecto seguido de replay. |
| Navegador Native | Cuatro aprobados, cero fallos y cero omitidos; 2020 inputs estables | Chromium y WebKit a 390/1280, cada caso con rama, proceso y recencia propios. Cookies, Better Auth, PostgreSQL, Drizzle y beez-ui reales. |
| Build aislado | Código cero; 1765 archivos equivalentes; 53/53 páginas generadas | Checkout propio reutilizado, sin archivos privados de entorno ni dependencias enlazadas. |
| Tipos y lint | Producto mediante el build; tipos de pruebas y lint focal aprobados | Incluye el caso Native nuevo y su diagnóstico directo con pg. |
| Arquitectura | Doce vistas aprobadas | Dos documentos y tres regiones en Chromium/WebKit a 390/1280, sin desbordes ni destinos locales ausentes. |

Los cuatro casos de navegador conservaron cero solicitudes nuevas de documento y de la ruta después de preparar la interacción. Los dos eventos de historial observados no representan una recarga. El escritorio confirmó HTTP 200 nativo antes de perder deliberadamente su respuesta con 502; recuperó el histórico junto a una configuración actual de versión posterior y comprobó que otra escritura exige recencia antes de crear una intención global con propósito y retorno exactos.

El guardián conservó una referencia privilegiada antigua sin leerla y guardó su frecuencia. Después de cambiar nativamente su membresía a muted, la lectura devolvió HTTP 403 y el render final retiró ambos formularios. Sólo quedó la recuperación explícita; no se consultó el original privilegiado. Se conservaron siete capturas entre los contextos del líder y del guardián y cuatro imágenes de layout. Los casos comprobaron cero entregas y cero políticas OTP añadidas, sin solicitar envíos externos.

La revisión estática inicial señaló tres P2: visibilidad tras denegación, falta de salida para started y una continuación cancelada durante la aceptación de identidad. El archivo completo reprodujo veinte casos verdes y diez rojos. Después de corregirlos, pasó treinta casos; un caso adicional comprobó la recuperación del guardián después de perder liderazgo. Esos 31 forman parte de los 95, no se suman de nuevo. La segunda revisión del mismo reviewer terminó sin hallazgos, con 40 archivos modificados, ocho normativos y diecinueve contextos estables; las ediciones posteriores de evidencia y pruebas requieren su revisión final propia.

Los intentos anteriores permanecen separados: tres archivos Native únicos terminaron 0/1 y dos intentos de cuatro casos terminaron 3/1. No se suman sus aprobaciones parciales. Se corrigieron la medición de navegación, la espera del commit antes de declarar una respuesta perdida, el plazo del forward y las assertions del guardián mediante condiciones nativas y render final; no se aflojó la exigencia de autoridad ni de efecto confirmado. Las capturas de cuentas distintas tienen archivos independientes para evitar sobrescritura.

El primer archivo Native del claim recuperable terminó 2/1 porque su SQL de preparación modificaba el lease sin incrementar la versión. La repetición reprodujo directamente mediante pg el SQLSTATE 23514 y `admission operation claim change requires one version increment`, conservó el rechazo y preparó el vencimiento con la versión correcta. No se cambió el producto ni el guard para aprobarlo.

## Alcance pendiente

El manual temático se prepara dentro del mismo trabajo con capturas reales y trazabilidad al código guardado; todavía no está publicado ni terminado. Su primer ensayo adicional de variantes agotó 600000 ms y terminó 0/1, con inputs estables y cinco capturas parciales, que no acreditan cierre. La inspección directa de PostgreSQL no encontró transacciones ni locks bloqueados. Se confirmó la ausencia del proceso Next propio y se eliminó únicamente la rama exacta acreditada por el receipt; quedaron producción, el piloto original y `dev-sandbox-guido`. La repetición separa validación y recuperación en dos casos completos, cada uno con rama, proceso y recencia propios y el mismo plazo de 600000 ms. Su resultado sigue pendiente y no forma parte de los 102 anteriores.

Faltan terminar esas variantes, el manual y sus índices, la conciliación posterior de recursos y el CI del incremento guardado. Los grupos, resumen enviado, outbox, dispatcher, mantenimiento y driver conservan sus tareas. Guardar los ajustes no acredita entrega externa ni activa OTP.

El [CI exacto de `d8ad9046`](https://github.com/guidomodarelli/TuTribu/actions/runs/38801684937) aprobó 520 archivos y 5407 casos, con 278 archivos y 804 casos omitidos y build de 53 páginas; valida el checkpoint anterior y no esta pantalla posterior. Las suites Native permanecen como evidencia independiente de los flags omitidos por el workflow ordinario.
