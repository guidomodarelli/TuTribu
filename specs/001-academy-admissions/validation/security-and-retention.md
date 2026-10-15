# Validación de seguridad y conservación

Checkpoint inicial del 2026-10-15, con las tandas Native observadas en ejecución, sobre `9890f3213257ba27a76ded3887d0861a8112c569`. T175 continúa abierta con su alcance original completo y las 212 tareas: 173 completadas y 39 pendientes. Ningún resultado parcial de este registro cierra T175 ni acredita los gates operativos.

## Requisitos y evidencia necesaria

| Requisito obligatorio | Cadena que debe observarse | Estado en el checkpoint inicial |
|---|---|---|
| AC-01: último cupo con cien competidores | Claims y autorización PostgreSQL reales, exactamente un ganador, 99 rechazos y reserva consumida tras perder al worker. | Tanda Native de cuotas en curso. |
| AC-01: cuenta/contacto entre tribus y canales | Solicitudes, fallos y cadencia con ventanas móviles/UTC; canal, contacto, clave, sesión o conexión nuevos conservan los contadores pertinentes. | Presupuestos y continuidad Native en curso. |
| AC-01: identidad y pagador originales | Intento y reserva mantienen tribu/conexión/versiones; `accepted` y `unknown` no se reenvían ni liberan consumo; no se usa una cuenta global. | Cuotas e integración de aislamiento en curso. |
| AC-02: reducción con trabajo en cola | El marker relee cupo, países y versión actuales antes de preparar credenciales o llamar al SDK; no autoriza por una reserva antigua. | Cuotas, países y tres canales con cupo cero en curso. |
| AC-03: caller sin permiso y payload arbitrario | Schemas/handlers reales y Next compilado rechazan sender, destino, texto, plantilla, campos de autoridad y host; objetos cruzados y origen ajeno no producen efectos. | Contratos locales aprobados; integración HTTP Native en curso. |
| AC-04: respuestas y autenticación | DTOs propios minimizados, cookies y API privada conservadas, causas privadas sin tokens/códigos en respuestas o errores públicos. | Lote local aprobado; bordes Native de auth en curso. |
| AC-04: logs, analítica y trazas | Reporter final de Next/SDK y agregados SQL seleccionan campos cerrados y correlación, sin canarios privados ni dimensiones arbitrarias. | Contratos locales aprobados; reporter y reader Native en curso. |
| AC-04: captura de controles privados | Tres componentes reales y widget publicado; captura JPEG real protegida y control negativo en Chromium/WebKit a 1280/390. | Cuatro casos de navegador aprobados; imágenes sólo en memoria. |
| AC-05: alcance local y Google global | Código genuino no sirve en otra cuenta/tribu/desafío; validar localmente no crea evidencia global, membresía ni recuperación de cuenta. | MAC local aprobado; aislamiento Native en curso. |
| Rotación de cifrado separada de BYOK | Mismo plaintext/ref/versiones/cuotas; lote bounded idempotente, ausencia de resurrección, rollback y conciliación del original sin retry. | Productor Native y DELETE concurrente en curso. |
| Fingerprint y payload MAC durante ventanas activas | Aliases/sujeto/consumo originales, clave retenida y material acreditado; ausencia o sustitución bajo el mismo id cierra sin crear otra identidad. | Crypto local aprobado; continuidad y persistencia Native en curso. |
| Seis propósitos y recuperación cerrada | Claves independientes/no extraíbles, AAD completo y recovery lock/época antes de acceso privado; no hay fallback de material. | Crypto/hosting local aprobado; owners privados Native en curso. |
| Secreto retirado y candidata | Bloqueo previo al purge, 24 horas desde retirada, siete días de candidata más 24 horas; ejecución tardía no extiende el reloj. | SecretStore, deadline y candidata Native en curso. |
| OTP de como máximo diez minutos | Material mínimo, expiración original, retiro después de aceptación y conservación del resultado incierto vigente. | Crypto local aprobado; mantenimiento Native en curso. |
| CSV de 24 horas, terminales de 180 días y auditoría de 365 | SQL real, filas frescas preservadas, lotes/no-op/rollback, archivo con fecha original y resultados mínimos conservados. | Retención y composición Native en curso. |
| Borrado sin liberar vínculos necesarios | Cuenta/tribu retiradas, referencias minimizadas y contadores conservados; otra identidad no recupera un contacto reservado. | Borrado/vínculos Native en curso. |
| Decisiones reconstruibles sin secretos | Actor/regla/tribu/recurso/versión/operación originales y metadata seleccionada; agregados y auditoría privada conservan scopes diferentes. | Constructores y casos de uso locales aprobados; lectores Native en curso. |
| Blockers operativos concretos | Distinguir configuración local, hosting original, restore, abuso operativo y preparación real por canal de las pruebas sintéticas. | Contraste operativo pendiente; no se generan claves sustitutas del piloto. |

## Preparación y resultados terminales disponibles

- El checkout principal comenzó limpio y el remoto coincide con el commit base. La vuelta anterior completó T174 y publicó su documentación; no se repite su resultado como ejecución de T175.
- El inventario inicial de Neon confirma únicamente producción y el piloto protegido. Los ensayos usan ramas propias del arnés existente y roles reales; no se modifica ni reinicia ninguna de esas dos ramas.
- La copia administrada `admission-security-validation` conserva el mismo commit y dependencias instaladas mediante `pnpm install --frozen-lockfile`. Next 16.3.4 termina su build real con código cero y configuración exclusivamente sintética. Se contrastaron 1727 archivos de producto; 121 diferencias de bytes eran sólo CRLF/LF según `.gitattributes`. No se modificaron los archivos de producto para igualarlos.
- Veinte archivos de contratos, autenticación, cifrado y observabilidad terminaron con **238 casos aprobados, cero fallos y cero exclusiones**, sin filtros de nombres. Las fuentes conservan sus hashes. Better Auth, Zod y Web Crypto se ejercen según sus contratos actuales; los dobles pertenecen a puertos propios o APIs ausentes de jsdom con justificación existente.
- El archivo completo `academy-contact-verification-routes.test.ts` terminó con **78 aprobados, cero fallos y cero exclusiones**. El handler real rechaza los campos de autoridad/payload antes de abrir la composición; esa condición precede a cualquier identidad o rol. Comprueba además DTOs, origen, correlación y salida de errores sin causa privada.
- El lote de navegador/SDK terminó con **20 aprobados, cero fallos y cero exclusiones**: cuatro del widget publicado y dieciséis del sender con SDK real y transporte propio. Se preservaron los hashes de ambos archivos. Estos 336 casos actuales pertenecen a 23 archivos diferentes y no suman repeticiones.
- Las tandas Native de cuotas y seguridad/conservación siguen en ejecución en este checkpoint. Sus handles vivos y targets están registrados localmente; la ausencia temporal de un JSON terminal no acredita éxito ni justifica reiniciar una ejecución. La segunda tanda consume el build aislado actual y recibe únicamente un selector no secreto de rol/base: cada URI real pertenece a la rama creada por el arnés y permanece en memoria.

## Revisión de superficies de salida

| Superficie | Owner inspeccionado | Evidencia y límite |
|---|---|---|
| Input y respuesta HTTP | `admission-contact-verification-handlers.ts`, `own-json-route-boundary.ts`, `messaging-route-http.ts` | Input una vez antes de composición, proyección propia mínima y selección de stage/code/status/request/trace. No se pasa la excepción, el body rechazado o la causa al logger. Los 78 contratos ejercen el handler; Next Native conserva su resultado pendiente. |
| Reporter de dispatch | `createMessagingDispatchReporter` | Elige código propio y referencias privadas de intento/entrega; no copia mensajes/cuerpos. La deduplicación diagnóstica no sustituye el ledger ni las métricas persistidas. El reporter final desde Next sigue en su tanda Native. |
| SDK y respuestas upstream | `ZavuMessageDeliverySender`, `ZAVU_DELIVERY_TRANSPORT` | Cliente por intento, logging apagado, cero retries, destino/sender ligados al intent y `fallbackEnabled:false`. Selección mínima del resultado de transporte, sin schemas sobre el SDK. Dieciséis casos actuales del SDK aprobados. |
| Auth y causas SQL | `AuthDatabaseOperationError` y el boundary nativo de auth | `toString`, JSON e inspección de consola tienen campos cerrados; la causa real permanece privada. Los contratos locales están aprobados y las causas PostgreSQL/SDK y rutas compiladas mantienen su prueba Native pendiente. |
| Métricas y auditoría | `admission-metric-dimensions.ts`, owners y readers de auditoría/métricas | Canales/fases/códigos cerrados y referencias privadas separadas de labels agregados. No se atribuye redacción automática al logger genérico. La lectura SQL actual y los casos de retención siguen pendientes de terminal. |
| Reporte visual | Tres presenters de contacto, diagnóstico y conexión con `admission-private-widget-capture.test.tsx` | Widget y JPEG reales en ambos motores/anchos; el control negativo demuestra que la exclusión protege el campo visible. No se guardan imágenes ni claves. |

El inventario de logs de mensajería/admisión localizó los reporters y las composiciones de invitaciones: seleccionan códigos fijos, no payloads ni causas. El sweep de pools conserva un solo checkout explícito en el guard compartido; los demás pools de auth, refresco de imagen y backfill usan `createPostgresPool`. Este incremento no modifica pools, retries ni el comportamiento del producto.

## Contraste operativo de sólo lectura

La observación del `2026-10-15T07:56:33.302Z` verificó la rama exacta del piloto y ejecutó sólo agregados mediante `pg` en `BEGIN READ ONLY`, con timeouts y cierre de conexión. No seleccionó bytes de clave, contacto, sender o plantilla; tampoco descifró ni llamó al proveedor. Confirmó una tribu, una candidata protegida, validación de credencial `valid`, estado `draft`, cero seleccionadas, cero capacidades preparadas y cero intentos externos.

| Condición | Hecho observado | Consecuencia y alcance |
|---|---|---|
| Claves/época del proceso local | No están presentes los inputs de entorno, época, recovery lock explícito ni keyrings en el proceso observador. | No acredita uso protegido desde ese proceso. No se inspeccionó ni se declara ausente la configuración del servidor o hosting original; tampoco se verificó coincidencia del material con la candidata conservada. |
| Restore operativo | Esta revisión no dispone de un ensayo acreditado de reconciliación del inventario original y época externa del entorno objetivo. | La prueba sintética de bloqueo/época no cierra OG-02 ni reemplaza T201. Se conserva el original y no se crean claves sustitutas. |
| Abuso y consumo reales | El piloto sigue en borrador, sin selección ni capacidad de canal preparada; no se enviaron mensajes externos en estos ensayos. | Las cuotas y el SDK sintéticos no certifican recursos, restricciones, gasto o deduplicación incierta del proveedor. La autorización humana acotada anterior persiste, pero la preparación y el ensayo real conservan T106/OG-03/OG-04. |

La observación administrativa encontró las dos ramas protegidas y otras dos durante las tandas independientes. El cierre deberá volver a comprobar la eliminación de las ramas propias después de sus terminales; este checkpoint no las presenta como retiradas mientras los procesos sigan trabajando.

## Límites que siguen vigentes

El build sintético no acredita que el hosting original tenga instalados sus keyrings, época o bloqueo de recuperación. Los inputs de una copia de pruebas tampoco permiten abrir la credencial protegida del piloto. No se regeneran claves para intentar descifrarla y no se guardan conexiones ni se realizan envíos externos desde estos ensayos.

Las pruebas de recovery lock/época y rotación no son un ensayo operativo de restore. La revisión de abuso debe distinguir controles de producto de preparación y restricciones reales del proveedor; ningún contador de llamadas acredita costo monetario exacto. Google global, preparación por canal, scheduler, restore y los seis gates conservan sus evidencias y tareas propias.

Las baselines [de cuotas](messaging-usage-and-abuse.md), [de permisos y privacidad](admission-security-and-privacy.md), [de bordes privados](private-http-hardening-baseline.md), [de rotación](messaging-protection-key-rotation-baseline.md) y [documental](security-documentation-completion-audit.md) aportan contexto por su alcance. Los casos ejecutados ahora se contabilizarán separadamente, sin sumar repeticiones ni usar evidencia histórica para afirmar una ejecución nueva.

## Seguimiento posterior al checkpoint inicial

El checkpoint inicial quedó guardado y subido en `bff9679a76c27100e8047245ec2c5361e8419785`. T175 sigue abierta, con 173 tareas completadas y 39 pendientes. Las siguientes observaciones no sustituyen los criterios de la matriz ni acreditan los gates operativos.

La tanda Native de cuotas terminó con **28 casos aprobados y dos fallos** en treinta casos. Ambos se reprodujeron sobre ramas propias con `pg` real, antes de editar las pruebas. El caso de sesión vencida había suspendido previamente el recurso al retirar y restituir el liderazgo: el resultado era `resource_unavailable`, coherente con la suspensión persistente. El caso histórico intentaba insertar eventos sin vínculo después de que el fixture común instalara todo el journal; PostgreSQL respondió `23514` desde `guard_credential_validation_usage_identity`.

La corrección afecta exclusivamente a los fixtures: conserva la suspensión y el consumo tras perder liderazgo, comprueba la sesión vencida en un recurso que sigue activo y crea los eventos históricos antes de su migración real mediante un prefijo del journal. Después ejecuta el upgrade íntegro y conserva las comprobaciones de identidad, fecha, anonimización y cupo. No desactiva triggers ni cambia los artefactos SQL. El prefijo mantiene su corte predeterminado para CSV y admite el corte explícito del historial de validaciones. Lint antes y después, tipos de las pruebas y `git diff --check` pasaron.

La tanda Native de seguridad terminó con **36 casos aprobados, un fallo y dos casos pendientes** al detenerse por el primer fallo. El error ocurrió al confirmar la eliminación de una rama temporal. El reporte contiene catorce archivos sin validación completa; sus entradas sin casos ejecutados no se consideran aprobadas. La conciliación administrativa del `2026-10-15T08:31:33.016Z` comprobó la propiedad exacta, eliminó la rama restante y confirmó que sólo quedaban producción y el piloto protegido, ambos conservados.

Se iniciaron dos tandas de continuación, cada una con un único worker: la suite completa corregida de ocho casos de validación de credenciales junto a los cuatro casos de composición de retención, y los catorce archivos originales de seguridad que no habían terminado. Usan el mismo producto que el build aprobado y los fixtures actuales contrastados entre checkouts. Sus resultados y la limpieza de sus nuevas ramas permanecen pendientes; no se contabilizan como éxito mientras sigan ejecutándose.

## Resultado de la continuación de fixtures

La primera continuación terminó el `2026-10-15T08:49:14.745Z` con **doce aprobados, cero fallos y cero casos pendientes**: los ocho de `credential-validation-budget.test.ts` y los cuatro de `admission-retention-composition.test.ts`, completos y sin filtros de nombres. Los archivos y sus dependencias de fixture conservaron sus hashes. La comprobación administrativa posterior confirmó la ausencia de las doce ramas propias de esa tanda y la conservación de producción y el piloto. Esta comprobación no incluye las nuevas ramas que sigue usando la tanda de seguridad.

El último CI también detectó un fallo intermitente en la prueba de observación tardía: `deadlineReached` resultó falso aunque los contadores y el resultado incompleto eran correctos. Los nueve casos del archivo original pasaron localmente; no se presenta esa corrida como reproducción local del fallo. La prueba afectada ahora controla los timers estándar: el run sigue esperando antes del límite, termina al alcanzarlo, conserva una sola escritura original para su resolución tardía y limpia los timers. Las expectativas de contadores y resultados se conservan; no cambia el worker de producto. Los nueve casos completos vuelven a pasar con la prueba corregida.

El inventario actual reúne **403 casos aprobados distintos en cuarenta archivos** para T175. Identifica cada caso por archivo, título y ordinal de parametrización dentro del mismo archivo; las variantes con títulos iguales se conservan y las repeticiones de una misma variante no se suman. Descarta resultados de fuentes modificadas, archivos incompletos y entradas sin casos ejecutados. La tanda de catorce archivos originales de seguridad sigue pendiente de resultado terminal: **T175 permanece abierta** y conserva todos los criterios de la matriz.
