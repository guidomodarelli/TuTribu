# Muestra determinista de mil contactos

SC-021 exige mil contactos con evidencia exigible válida: ochocientos habilitados deben ingresar automáticamente y doscientos no habilitados deben quedar en revisión al permitir excepciones. Esta muestra no tiene un criterio de latencia ni sustituye SC-013, SC-015 u otros gates.

## Protocolo

`tests/performance/academy-admissions-sample.test.ts` usa el mismo owner de ramas efímeras, journal y despliegue Node autenticado que el ensayo de cien. `ADMISSION_NODE_ADMISSION_SAMPLE=1` selecciona exclusivamente desde el entorno server-side la muestra fija 1000/800/200. El body no acepta cuentas, roles ni dimensiones. El default del otro caso conserva cien participantes, cincuenta coincidencias, sus cronómetros y el objetivo inferior a tres segundos.

Los seeders existentes preparan mil usuarios, sesiones, cuentas vinculadas y capturas sintéticas Workspace vigentes, y diez mil filas de lista, entre ellas los ochocientos contactos habilitados de la muestra. Un preflight SQL contrasta las mil identidades/sesiones, evidencia/cuenta/vínculo/correo coherentes, las ochocientas coincidencias habilitadas, las doscientas ausencias y cero miembros previos. Es preparación sintética explícita y no acredita captura externa de Google.

`runAdmissionSample` presenta cada identidad una vez por los casos de uso y repositorios reales, con los commits originales de claim y efecto. Ejecuta diez grupos de cien para observar el resultado determinista completo; no presenta ese ordenamiento como rendimiento de mil concurrentes. Conserva todas las respuestas y fallos, acumula las admisiones/revisiones y consulta el stock real. La respuesta propia `sample` se valida antes de persistirla/entregarla, separada de `measurement` de latencia. No se deriva un percentil global a partir de percentiles de grupos.

La prueba exige 800 ingresos/200 pendientes, mil solicitantes distintos en SQL, ochocientas membresías básicas y decisiones automáticas, doscientas pendientes y cero entregas. Repetir el POST debe devolver el mismo resultado sin ejecutar otra cohorte. Los destinatarios y claves son sintéticos; se conservan los permisos y validaciones reales y no hay transporte de mensajes.

## Verificación inicial

El caso rojo sobre el runtime anterior produjo un resultado de cien y falló por ausencia de `sample`; registro `.git/admission-sample-red.json`. La implementación reutiliza los generadores y la ejecución nativa, sin mocks de SDK ni reemplazo de SQL. Tipos y lint pasaron, al igual que los casos locales de proyección/handler existentes. La integración de mil y su limpieza se registran antes de acreditar SC-021. T200/T209 siguen pendientes con su alcance completo.
