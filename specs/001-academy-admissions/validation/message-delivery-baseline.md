# Cola privada e intentos de entrega

**Feature**: `001-academy-admissions`. **Base**: `dc9479db759481455349aef936573967b2b14a0a`, branch `feature/academy-admissions-spec`. Avance de T040/T042 y base para T043; no hay sender o dispatcher productivo habilitado.

## Modelo y fronteras

Las entidades propias separan obligación de entrega, intento externo, política editable y reserva consumida. Un marker es evidencia de posible envío incluso si el proceso murió antes de invocar RPC. La elegibilidad de claim requiere queued/due/plazo vigente/lease ausente o vencida y ninguna marca anterior. Accepted y delivered son estados de transporte distintos y no producen prueba de contacto o membresía.

`MessageDeliveryRepository` define operaciones DB-only. `PostgresMessageDeliveryRepository` reutiliza el executor protegido y exige una autorización explícita de mantenimiento para cada acción, también después de sus esperas. Esa autorización no puede tomar locks compartidos de tribu/política antes de las primitivas SQL exclusivas. Claim devuelve metadata privada; el marker vuelve a comprobar scope, lease/version, líder, país/política vigentes y entorno/época. Su contexto original se entrega únicamente después del commit confirmado. Un commit perdido no concede permiso de RPC ni dispara un retry automático.

La finalización pertenece al mismo attempt/lease. Puede confirmar una respuesta tardía del original unknown o avanzar accepted a delivered; SQL rechaza downgrade, provider id conflictivo o versión competidora. No depende de que el secreto siga disponible. La reconciliación de una lease marcada mantiene reserva/cupo y jamás vuelve a claim esa entrega. El módulo no descifra credenciales, no envía y no modifica la prueba local.

## Claim por tribu

La migración versionada `20261006140000_claim_messaging_deliveries_fairly.sql` añade un índice por tribu/due/id y una primitiva separada. Selecciona una cabeza elegible por tribu, aplica SKIP LOCKED y vuelve a comprobar elegibilidad al bloquear y actualizar. Una tribu con mensajes más antiguos no llena todas las posiciones del lote. Las funciones anteriores conservan su contrato; Drizzle refleja el índice nuevo.

## Evidencia

Pasaron cinco SQL reales sin skips en 160,23 segundos con las migraciones efectivas y fixtures sintéticos de emisión/HMAC/envelope/ledger. Las ramas fueron propias y se eliminaron con ausencia comprobada antes de registrar cada verde:

- Marker/reserva únicos, ningún segundo claim, accepted separado de delivered, replay idéntico y rechazo del resultado tardío que intenta bajar un estado ya entregado; código sigue issued y no hay proof de admisión.
- País retirado después del claim: suppressed/recipient_not_allowed antes de reservar, sin attempt ni costo externo; la solicitud original conserva su evento.
- Lease marcada vencida: unknown con reserva consumida, sin reclaim y con receipt tardío que confirma ese mismo intento/version.
- Doce mensajes antiguos de una tribu junto a otras tribus: primer lote de tres tiene tres tribus, y llamadas concurrentes no duplican una lease viva.
- Autoridad de plataforma ausente o recovery lock posterior al marker: denegación o rollback de marker/reserva/versión juntos.

La primera revisión nativa aceptó dos P2: supresión/cuota salían antes de revalidar autoridad/configuración; replay de delivered/rejected usaba la versión inicial del contexto. Tres SQL adicionales reprodujeron ambos problemas en 100,38 segundos. Se agregaron checks inmediatamente después del SQL antes de cualquier outcome y se utiliza la versión actual para los receipts ya fuera de in_flight, conservando las guardas de identidad/conflicto/downgrade. La suite final pasó siete SQL sin skips en 235,88 segundos, incluidos ambos replays terminales y rollback tras revocación durante supresión/cuota. La revisión final confirmó ambos fixes sin hallazgos y con trece hashes estables. Pasaron también 191 casos de dominio (doce nuevos y 179 de regresión), lint, ambos typechecks y diff check. El test de dominio utilizó el entorno configurado del proyecto y verificó conducta; no certifica por sí solo Chromium/WebKit o Workers.

La arquitectura .htm pasó cuatro renders Chromium/WebKit a 390/1280, sin overflow horizontal o enlaces locales rotos, con cierre de ambos browsers y exit 0 del helper. No se ejecutó un browser de producto ni se envió un mensaje.

## Pendientes

T042 queda completa como primitiva DB-only tras cerrar T041/T040/T013. El repositorio actual pasó ocho SQL dentro de la regresión de 31 casos sin skips en 327,26 segundos: wrapper de marker COMMIT perdido, rollback de supresión/cuota al retirarse permiso, un marker/reserva, replay terminal, lease marcada unknown y recepción tardía original, retiro de país y fairness concurrente. La revisión actual no encontró hallazgos en repo/SQL; diez hashes inicial/final estables. La recepción definitiva también integra purga de material OTP con autoridad específica vigente, según su baseline.

El dispatcher/preparación/SecretStore/sender y sus límites se completan como primitivas en T043, con el cierre descrito en [message-dispatch-baseline.md](message-dispatch-baseline.md). Factories de request/trabajo de T047, endpoints/mantenimiento de las historias, Node/Workers y todos los gates operativos conservan sus tareas. No se modificó default/producción ni se enviaron mensajes.

Decisión propietaria: [tenant-messaging.htm](../../../docs/architecture/tenant-messaging.htm). Las rutas/UI y los manuales de flujos disponibles no cambian por estas primitivas privadas.

## Cierre de modelos T040

Sobre dc9479db, se verificaron los cuatro modelos propios y su policy con consumo real por los adapters/use cases actuales. La revisión de seis archivos no encontró brechas y conservó hashes estables. Los dieciséis locales de policy/uso pasan; T013 aporta veinte SQL reales sobre marcadores/identidad/costo, campos queued/authorized, países/cupos/versiones vigentes y ausencia de proof desde accepted/delivered.

T013/T017 están satisfechas y T040 queda completada como identidades/entidades y reglas puras. Los counters, repositorios/dispatcher/SDK, configuración operable, scheduler y gates conservan sus tareas; este cierre no habilita un canal o ruta nuevos.
