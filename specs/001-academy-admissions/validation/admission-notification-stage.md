# Coordinación de obligación y avisos internos

T200/T209 mantienen el objetivo p95 inferior a tres segundos y los demás criterios pendientes. La carga previa de `dd551953` dio 6.187,21 ms con cien respuestas correctas. No se cambia el workload, la audiencia, el conteo de destinatarios o el umbral.

## Responsabilidades y decisión

`resolveAdmissionNotificationAudience` conserva en domain la relación evento→audiencia. `createPostgresAdmissionNotificationObligationWriter.record` coordina los mismos efectos mediante `stage_admission_notification_obligation` en una sola llamada SQL. El coordinador crea con la función auditada original, lee la audiencia revisora después de las esperas y ejecuta el enqueue original para cada destinatario. La resolución del solicitante mantiene su destinatario original. `recordMany` conserva el camino en bloque para solicitantes y delega cada unidad revisora al mismo contrato individual.

La función usa PL/pgSQL VOLATILE y sentencias secuenciales para conservar snapshots frescos. Materializa los IDs y adquiere todos los locks revisores en el orden original antes de encolar. No introduce transporte, commits propios, nuevas autorizaciones ni reglas de recencia. Auditoría, payload vacío, unicidad y replays de las funciones originales permanecen activos.

La migración versionada `20261018072423_stage_admission_notification_obligation.sql` se registra como idx187, después de las 187 entradas anteriores. Su función SECURITY INVOKER tiene search_path fijo y EXECUTE público; el invocador continúa necesitando las capacidades privadas anteriores de cada hijo, los permisos de lectura/lock y las policies RLS aplicables. No concede table writes ni ejecución privada a un rol que no los tenía. El journal debe aplicarse antes de consumir la nueva llamada; no se agrega fallback a un esquema antiguo. Sólo se usa el migrador contra la conexión entregada por el owner de una rama propia.

## Ejecuciones funcionales

La reproducción previa falló en la primera invocación nativa del contrato todavía ausente; registro `.git/admission-notice-stage-red.json`. La primera ejecución con la migración pasó selección tras una espera comprobada, recordatorio con revisores vigentes y lote mixto con rollback de obligación/avisos/auditoría. Su caso adicional de rol reducido detectó permisos de fixture insuficientes para el antiguo `SELECT FOR SHARE`; después de conceder lectura y UPDATE de una sola columna, RLS siguió ocultándole revisores. Se conservan ambas observaciones fallidas en `.git/admission-notice-stage-native.json` y `.git/admission-notice-stage-caller-after.json`.

El caso corregido compara los destinatarios de ese rol con la consulta anterior ejecutada realmente bajo el mismo RLS, sin elevarlo a owner ni darle INSERT sobre avisos. Conserva rechazo por falta de ejecución privada, audiencia inválida, ámbito cruzado y escritura directa denegada. La creación por el owner produce dos avisos revisores y uno de solicitante, con dos hechos de obligación y tres de materialización. La repetición del migrador deja iguales su historia y los contadores de obligación, avisos y auditoría. Pasó en `.git/admission-notice-stage-caller-replay.json`.

Los 923 casos ordinarios seleccionados pasaron, con tres nativos omitidos en ese comando. Tipos de producto/tests, lint y build real de Next pasaron. Las ocho regresiones Native completas de storage/auditoría pasaron: conservan los límites de visibilidad de solicitante/revisor, estado leído, aislamiento entre cuentas, replay y el vínculo al ledger real sin repetir hechos o muestras. Registro `.git/admission-notice-stage-regressions.json`.

El [reporte saneado](admission-notification-stage.json) conserva doce casos SQL funcionales distintos aprobados: tres del primer archivo completo, su caso de permisos/RLS/replay reejecutado y ocho de storage/auditoría. También conserva los fallos de preparación del fixture sin contarlos como resultados verdes. Registra seis huellas de inputs, el journal de 188 entradas y la limpieza verificada de las ramas propias, con las tres anteriores preservadas. Los 187 registros anteriores del journal y el historial publicado del changelog permanecen iguales. La carga completa se repetirá sobre el commit publicado; las pruebas funcionales no acreditan por sí solas el p95 ni envíos externos.

## Carga completa y recursos observables

La [corrida de c30e78fc](admission-notification-stage-load.json) conservó 50 ingresos/50 pendientes, cero fallos, diez mil entradas, cien solicitudes, cincuenta miembros básicos y cero entregas. Mantuvo 300 adquisiciones/liberaciones, máximo cien y cero esperas o conexiones retenidas. Las cien llamadas al coordinador acumularon 4.523,12 ms de ejecución SQL, con 45,23 ms de promedio. El p95 de aplicación fue **6.372,48 ms y siguió fallando** frente a 3.000 ms; esta corrida no acredita una mejora respecto de los 6.187,21 ms previos.

Una función diagnóstica independiente, autenticada y fijada a otra rama propia, informó Node 24.16.0 y dos procesadores disponibles. Los archivos de cuota cgroup no eran legibles: la cuota y el período permanecen desconocidos, no se interpretan como cero ni como capacidad ilimitada. El probe rechazó al anónimo y sólo devolvió esos números; no leyó credenciales ni filas de la aplicación. Funciones y ramas de ambos ensayos se eliminaron, y se confirmaron las tres ramas preexistentes. El artefacto conserva las huellas de los scripts privados usados para el diagnóstico.

El arnés permite seleccionar explícitamente la capacidad de su endpoint efímero mediante `ADMISSION_NODE_COMPUTE_UNITS`; el default continúa en 2 CU y el deploy exige el mínimo/máximo realmente seleccionado antes de ejecutar. La configuración productiva, el pool, el workload y el umbral no cambian. El siguiente ensayo de capacidad se registrará separado de esta corrida para comprobar el efecto del recurso sin atribuirlo al código.

## Contraste de capacidad del endpoint

El [ensayo de 7e8918bd con 8 CU](admission-notification-eight-cu.json) verificó mínimo y máximo de 8 CU en `aws-us-east-1`, con el mismo protocolo de aplicación. La selección experimental sólo afecta el endpoint de la rama propia; el default del arnés sigue en 2 CU. No se cambia ningún endpoint productivo o preexistente.

Se conservaron los 50 ingresos/50 pendientes, cero fallos, diez mil entradas, cien solicitudes, cincuenta miembros básicos, cero entregas y 300 adquisiciones/liberaciones sin esperas ni retención. El p95 fue **5.341,00 ms y siguió fallando** frente a tres segundos. La preparación y calentamiento separados fueron 2.518,20 y 2.998,59 ms; la sonda mínima dio 3,02 ms y el event loop, 102,69 ms. Los p95 de transacciones de cuenta/comando fueron 230,46/3.815,33 ms.

La ventana medida duró 5.435,35 ms y registró 3.335,58 ms de CPU user, 1.052,50 ms system, 3.763,37 ms de event loop activo y 1.671,98 ms idle. La utilización fue 0,692, frente a 0,315 en la corrida de 2 CU. Estos datos justifican atribuir el trabajo del cliente antes de seguir cambiando capacidad; no acreditan una cuota de CPU ni una causa única. La función y rama de 8 CU se eliminaron, y se confirmaron sólo las tres ramas anteriores. El gate y las catorce tareas abiertas permanecen pendientes.

La CI ordinaria del código de coordinación pasó en [push](https://github.com/guidomodarelli/TuTribu/actions/runs/39108438339) y [PR](https://github.com/guidomodarelli/TuTribu/actions/runs/39108442471); las dos cargas opt-in mantienen su aserción de latencia fallida por separado.
