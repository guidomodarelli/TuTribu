# Esperas de backends durante la invocación Native

T200/T209 siguen pendientes. La última cohorte sin observación terminó con cien resultados correctos y p95 de 6.327,19 ms. Este diagnóstico busca distinguir capacidad de backends y esperas; conserva el objetivo inferior a 3.000 ms.

## Alcance

`ADMISSION_NODE_OBSERVE_BACKENDS=1` activa un sampler únicamente en el controlador del ensayo. Usa una conexión independiente del proceso Node medido para consultar `pg_stat_activity` en la rama propia. Cada muestra agrupa sólo backends marcados con el `application_name` de la invocación y conserva cantidades por estado, clase y evento de espera. Cuenta además otros clientes de esa rama; no los atribuye a la carga.

La consulta no selecciona texto SQL, usuarios, direcciones, PID, credenciales ni valores de parámetros. El identificador de aplicación sirve sólo al filtro y no se devuelve. Las muestras y los errores SQLSTATE están acotados; `stop()` espera la consulta actual antes de retornar. Un fallo del observador queda registrado y no sustituye el resultado original del workload.

El sampler cubre la invocación completa, incluida preparación y warm-up. El host adjunta una ventana de pared del tramo medido para interpretar las muestras, cuyo timestamp proviene de PostgreSQL. Son relojes distintos; el p95 sigue calculándose exclusivamente con el reloj monotónico de cada llamada original. La observación agrega carga de control y no se usa como prueba de mejora de latencia respecto del ensayo sin sampler.

## Conexión efectiva del host

El resultado informa qué binding seleccionó (`DATABASE_URL_UNPOOLED` o `DATABASE_URL`) y si su hostname contiene el marcador `-pooler`. No publica el URI, hostname ni credenciales. La ausencia del marcador no demuestra por sí sola la topología de un endpoint intermediario. Los campos nuevos son opcionales al leer resultados históricos y obligatorios en el ensayo Native actual.

## Verificación inicial

La prueba `tests/unit/support/admission-backend-observation.native.test.ts` usó `pg`, transacciones y locks advisory reales en una rama propia. Un cliente ajeno no apareció en la cuenta del workload. Con dos clientes propios identificó un backend activo esperando el lock y otro idle dentro de una transacción. El sampler devolvió muestras sin errores, se drenó y observó cero backends propios después de los rollbacks.

El [resumen saneado](admission-backend-observation-contracts.json) conserva ese contrato. Pasaron también quince casos locales de handler y observación de awaits, tipos de tests y lint. La compilación real del host Node conservó 635 inputs. La siguiente cohorte debe registrar las muestras, la conexión efectiva, los cien resultados, stock, replay y pool; la aceptación p95 conserva su aserción original.
