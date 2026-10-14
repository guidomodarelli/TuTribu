# Ejecuciones y fases reales del dispatcher

Avance sobre `e0fceb26f1e78d59de96e2abe1527c341fa45a9f`. El inventario original mantiene 212 tareas, 164 completadas y 48 pendientes. T169/T170 siguen abiertas por los demás productores, retención, interfaces y gates.

## Implementación

La composición privada usa el dispatcher portable original con observadores independientes para cada ejecución. Registra contadores únicamente de sus tribus nativas, llamadas realmente observadas y la salud operativa separada de los resultados de entrega y de la disponibilidad del registro. Una cola global vacía no inventa una tribu; un escaneo focal confirmado puede terminar con cero obligaciones.

La preparación de inicio y la escritura final consumen el presupuesto del worker. La muestra SQL se relaciona con el reloj del host antes de la espera final de inicio. El owner toma un reloj nuevo después de la última espera de autorización para resolver el cierre. La respuesta tardía conserva la misma escritura. El flujo no repite un marcador, un POST ni una finalización que perdió su respuesta.

Las fases claim/authorize/prepare/send/complete/late/defer mantienen identidad privada de muestra y atribución al origen. Una respuesta tardía a un claim global conserva únicamente sus scopes reales, como ejecución incompleta. Las recuperaciones de confirmación cuentan sólo el recibo original o su avance válido; una excepción no se convierte en un contador pendiente de otra tribu.

Las migraciones idx162/163 agregan almacenamiento privado de ejecuciones/muestras e integran esas muestras al reader de métricas. Las tablas tienen FORCE RLS y escritura del owner. Las filas no copian actor humano, contacto, cuerpo, token, keyring o identificador del proveedor. La proyección pública mantiene dimensiones cerradas y predicados de tribu, y sólo una ejecución completada desplaza `lastSuccessfulRun`. Los replays conservan el finish original y deduplican muestras.

## Validación y diagnósticos

- Cincuenta y seis tests locales pasan sin fallos ni filtros, incluyendo tiempos acotados, dos tribus, contadores confirmados, falta de observación, claim global tardío, aislamiento de late/defer, correlación/loggers y proyecciones propias de métricas.
- Trece casos PostgreSQL distintos pasan entre la validación amplia 12/1 y la regresión final 1/0/2. Incluyen Pool, Drizzle, cifrado y SDK reales con transporte controlado, dos composiciones nativas, autoridad/rollback/RLS, el reader público, los tiempos tardíos y el comando real de 63 migraciones con repetición. Los dos casos filtrados en la repetición focal ya habían aprobado sobre el mismo producto.
- Se conservan el fallo inicial de la prueba de identidad por ordinal de lecturas y la corrección basada en el commit real del ledger; el caso de late scope vacío y el contador compartido se corrigen en sus owners. La prueba positiva de concurrencia conserva sus aserciones y usa una configuración explícita; las pruebas de timeout mantienen sus límites específicos.
- La ampliación detectó SQL22P02 al convertir un parámetro UUID escalar en array durante el cierre. Una conexión `pg` a la base configurada reprodujo `array_in` con una consulta sintética de lectura y confirmó la selección con UUIDs parametrizados. El recorder usa esa selección y actualiza únicamente los scopes realmente insertados. Se conservan los informes 7/5 y 0/1 anteriores.
- La revisión identifica el reloj tomado antes de la última espera de autoridad. Se mueve esa comprobación antes de la muestra final y se agrega una regresión real con espera posterior a las escrituras.
- La ampliación 12/1 tenía un único fallo de preparación: el checkpoint abría otra conexión y la adquisición consumía el presupuesto antes de la espera que debía probarse. La regresión usa el reloj de la transacción original, confirma que las escrituras estaban dentro del plazo y verifica que la espera posterior produce un finish incompleto. La repetición focal aprueba.
- Los tipos de producto/tests y lint pasan. El build real de Next termina con código cero; sus dieciséis fuentes de producto coinciden con el conjunto de las pruebas PostgreSQL. Las dos secciones de arquitectura se verifican en Chromium y WebKit a 390 y 1280 píxeles, sin desbordes, errores de página ni enlaces rotos. Las capturas móviles se inspeccionan visualmente.

## Alcance pendiente

Este avance no completa otros productores ni certifica todos los gates SC. La retención de las nuevas observaciones se integra con T171; los demás workers, la programación operativa y la interfaz de actividad mantienen sus tareas. Los originales de expiración y los estados/consumos de entrega conservan sus fuentes propias.

No hubo envíos externos ni regeneración de las protecciones del piloto. La documentación está en `docs/architecture/tenant-messaging.htm#messaging-dispatch-observations` y `docs/architecture/academy-admissions.htm#admission-dispatch-run-metrics`.
