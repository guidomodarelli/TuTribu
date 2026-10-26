# Muestra determinista de mil contactos

SC-021 exige mil contactos con evidencia exigible válida: ochocientos habilitados deben ingresar automáticamente y doscientos no habilitados deben quedar en revisión al permitir excepciones. T120 ya conserva una ejecución SQL anterior aprobada en [su auditoría](allowlist-import-validation-completion-audit.md) y [su muestra persistida](allowlist-persisted-sample-baseline.md). Este ensayo revalida el código actual en el runtime Node cercano; no reemplaza ese cierre ni presenta el criterio como antes ausente. Esta muestra no tiene un criterio de latencia ni sustituye SC-013, SC-015 u otros gates.

## Protocolo

`tests/performance/academy-admissions-sample.test.ts` usa el mismo owner de ramas efímeras, journal y despliegue Node autenticado que el ensayo de cien. `ADMISSION_NODE_ADMISSION_SAMPLE=1` selecciona exclusivamente desde el entorno server-side la muestra fija 1000/800/200. El body no acepta cuentas, roles ni dimensiones. El default del otro caso conserva cien participantes, cincuenta coincidencias, sus cronómetros y el objetivo inferior a tres segundos.

Los seeders existentes preparan mil usuarios, sesiones, cuentas vinculadas y capturas sintéticas Workspace vigentes, y diez mil filas de lista, entre ellas los ochocientos contactos habilitados de la muestra. Un preflight SQL contrasta las mil identidades/sesiones, evidencia/cuenta/vínculo/correo coherentes, las ochocientas coincidencias habilitadas, las doscientas ausencias y cero miembros previos. Es preparación sintética explícita y no acredita captura externa de Google.

`runAdmissionSample` presenta cada identidad una vez por los casos de uso y repositorios reales, con los commits originales de claim y efecto. Ejecuta diez grupos de cien para observar el resultado determinista completo; no presenta ese ordenamiento como rendimiento de mil concurrentes. Conserva todas las respuestas y fallos, acumula las admisiones/revisiones y consulta el stock real. La respuesta propia `sample` se valida antes de persistirla/entregarla, separada de `measurement` de latencia. No se deriva un percentil global a partir de percentiles de grupos.

La prueba exige 800 ingresos/200 pendientes, mil solicitantes distintos en SQL, ochocientas membresías básicas y decisiones automáticas, doscientas pendientes y cero entregas. Repetir el POST debe devolver el mismo resultado sin ejecutar otra cohorte. Los destinatarios y claves son sintéticos; se conservan los permisos y validaciones reales y no hay transporte de mensajes.

## Verificación inicial

El caso rojo sobre el runtime anterior produjo un resultado de cien y falló por ausencia de `sample`; registro `.git/admission-sample-red.json`. La implementación reutiliza los generadores y la ejecución nativa, sin mocks de SDK ni reemplazo de SQL. Tipos y lint pasaron, al igual que los casos locales de proyección/handler existentes. La regresión actual y su limpieza se acreditan a continuación; T200/T209 siguen pendientes con su alcance completo.

## Regresión aprobada sobre fc074d9a

La [evidencia saneada](admission-thousand-contact-sample.json) registra un caso Native aprobado y cero omitidos sobre un árbol limpio, Node 24.16.0 y el endpoint propio de 2 CU. SQL previo confirmó mil cuentas/sesiones con evidencia/vínculo/correo vigentes, ochocientas coincidencias habilitadas, doscientas ausencias y cero miembros existentes. Las diez unidades de cien ejecutaron todos los comandos: las primeras ocho confirmaron cien ingresos cada una y las últimas dos cien pendientes cada una, sin fallos.

El replay devolvió el resultado original sin iniciar otra muestra. Una consulta SQL independiente posterior contó mil solicitudes y mil usuarios distintos, ochocientas membresías básicas activas y decisiones automáticas aprobadas, doscientas pendientes y cero entregas. El stock incluyó diez mil entradas de lista. Las 3.000 adquisiciones/liberaciones quedaron equilibradas, sin errores ni esperas/conexiones pendientes al finalizar. La ejecución funcional completa duró 77.614,61 ms, con preparación separada de 2.878,15 ms; ninguno de esos números acredita latencia de cien o mil concurrentes.

Función y rama propias se retiraron y una lectura independiente confirmó sólo las tres ramas preexistentes. Registros privados: `.git/admission-sample-native-measurement.json`, `.git/admission-sample-native.json` y `.git/admission-sample-native-cleanup.json`. Los 23 casos locales de proyección/handler, tipos y lint pasaron.

## Conservación del ensayo de cien

La [regresión del modo ordinario](admission-default-after-sample.json) usó el mismo SHA de bundle `f8ce356979831ae76b750dfcc14c51b0f3709655fbe754b8e55cbd864225d6ea`, con selección de muestra deshabilitada. Conservó cien participantes, cincuenta ingresos/cincuenta pendientes, cero fallos y 300 adquisiciones/liberaciones sin esperas ni conexiones retenidas. La respuesta no incluyó `sample`. SQL y replay conservaron cien solicitudes/cincuenta miembros/cero entregas.

El p95 de 6.333,38 ms mantuvo el fallo frente a tres segundos, después de las comprobaciones funcionales. Los cambios de worktree durante esa corrida fueron sólo estos artefactos de validación; los inputs de runtime permanecieron iguales. Función y rama propias se retiraron y quedaron preservadas las tres anteriores. Registros privados: `.git/admission-default-after-sample-measurement.json`, `.git/admission-default-after-sample-native.json` y `.git/admission-default-after-sample-cleanup.json`. Esta regresión no cierra la latencia ni amplía el cierre anterior de T120 a otros gates.
