# Accesos autorizados a recursos y credenciales de mensajería

Avance sobre `9cda4663a1631014b0be90f19fcdd705ffe8b7d4`. Las 212 tareas originales conservan 164 completadas y 48 pendientes. T169/T170 siguen abiertas: este avance cubre estos accesos y sus diagnósticos, mientras los productores restantes, runs/fases completos, retención, pantallas y gates requieren su implementación y validación.

## Recorridos implementados

El almacén de secretos registra el acceso únicamente después de autorizar el ámbito nativo y descifrar el material vigente. El hecho comparte su transacción; antes de devolver el valor vuelve a comprobar el estado de recuperación, entorno, época y límites temporales. Un fallo posterior revierte el registro y no devuelve la credencial.

El lector de recursos completa las páginas reales del proveedor y guarda su DTO propio antes de registrar la página seleccionada. El recorder vuelve a autorizar cuenta, sesión, líder, conexión, versión y evidencia reciente en su transacción. La aplicación verifica nuevamente la identidad y el ámbito después del registro; una pérdida de autorización o cancelación impide publicar el resultado. No crea un envío ni consume cuota.

El hecho conserva tribu, conexión, versión de configuración utilizada, regla y reloj SQL. La versión no se presenta como versión del ciclo de vida de la conexión. El acceso humano conserva al actor; el worker no inventa uno. Estos accesos no tienen un ledger de comando, por lo que mantienen `operationId` nulo. La metadata contiene sólo superficie, clase y cantidad; nunca credenciales, key IDs, envelopes, referencias privadas, contenidos del proveedor o destinos.

Los dos dispatchers reutilizan un reporter privado que selecciona etapa, código cerrado e identificadores propios mínimos. Conserva la correlación fijada por el logger, omite causas y payloads y evita repetir la misma excepción para la misma etapa/entrega/intento. Errores independientes e intentos distintos conservan sus diagnósticos.

## Evidencia

- Treinta tests locales pasan sin fallos ni filtros: paginación completa con inspector real y transporte controlado, autoridad cambiante, fallo del recorder, cancelación, proyección pública, privacidad/correlación y deduplicación del logger real.
- Doce tests contra PostgreSQL pasan sin fallos ni filtros usando Pool, Drizzle, cifrado WebCrypto y adapters reales. El caso positivo comprueba ambos hechos, scope/actor/versión, metadata seleccionada y ausencia de ledger; la recuperación activada durante el recorder revierte el nuevo hecho. Los demás casos conservan los rechazos de ámbito, autoridad, vigencia y acceso de worker.
- Los tipos de tests pasan después de los dos casos adicionales de publicación. Los tipos de producto y lint habían pasado sobre el mismo producto.
- El build real de Next termina con código cero en un worktree con dependencias propias y entorno sintético. Las fuentes de producto coinciden con el conjunto validado; no se copian entornos ni claves del piloto. La sección de arquitectura se valida en Chromium y WebKit a 390 y 1280 píxeles, sin desbordes, errores de página ni enlaces rotos.

## Límites y pendientes

No se agrega una pantalla ni se cambia un permiso, formulario o recorrido de los manuales existentes. La actividad completa sigue restringida al líder. La existencia del reporter no demuestra métricas de un dispatcher, runs exitosos ni tiempos de todas sus fases; esos productores siguen pendientes, junto con retención general, mantenimiento programado, rollout y gates.

No hubo envíos externos ni regeneración de las protecciones del piloto. Su candidata cifrada y su rama se conservan. La arquitectura se documenta en `docs/architecture/tenant-messaging.htm#messaging-authorized-exposure`.
