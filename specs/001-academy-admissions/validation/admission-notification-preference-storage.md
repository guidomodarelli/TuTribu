# Persistencia privada de preferencias de admisión

Este incremento amplía la política privada guardada en 13758e7a. No expone todavía un control de producto ni habilita correo, OTP, agrupación o envíos. T180, T181 y T184 conservan su alcance completo pendiente; el inventario original sigue en 174 tareas completas y 38 pendientes de 212.

## Contrato implementado

- El puerto admite únicamente la cuenta/sesión nativa y la tribu resueltas en el servidor. No recibe otro destinatario, rol ni fecha de efectividad del navegador.
- Lecturas sin fila conservan los defaults de líder y guardián sin inicializar almacenamiento ni ajustes de correo.
- El repositorio repite la identidad de PostgreSQL, toma los locks originales de tribu, cuenta, sesión y membresía revisora y vuelve a comprobar su vigencia después de las esperas y de la escritura.
- El guardado inicial usa la clave compuesta de cuenta/tribu y una inserción que rechaza conflictos. Las actualizaciones comparan versión bajo lock; la versión se comprueba antes de devolver un no-op. Los intentos perdedores no sustituyen una elección más nueva.
- El trigger original del nuevo artifact SQL fija el reloj real al escribir, impide cambios de identidad, exige un incremento por cambio y preserva versión y época ante un no-op. La proyección conserva texto de PostgreSQL sin pasar por Date.
- RLS forzada limita la lectura no privilegiada a la propia fila de un revisor activo. Los roles de request no tienen un writer por policy. El repositorio privilegiado repite scope y autoridad; la policy del owner solo conserva la ejecución privada.
- Un fallo del guard final se propaga al executor transaccional y revierte la elección staged. No crea otro intento ni oculta errores de storage.

## Validación

El primer intento del archivo Native terminó con **3 casos aprobados, cero fallos y cero filtrados**, con todos sus inputs estables. La revisión detectó que la prueba de vencimiento podía pasar si la sesión expiraba antes de la escritura, sin distinguir el rollback final. Ese intento se conserva como diagnóstico y no certifica ese recorrido. El test corregido observa mediante SQL real el modo y versión staged antes de propagar el error al rollback, y después comprueba la restauración.

La repetición actual del archivo completo terminó el `2026-10-15T14:21:56.267Z` con **3 casos aprobados, cero fallos y cero filtrados**, fuentes estables. La observación interna confirmó `daily`, versión dos, antes de propagar el error de sesión; después del rollback confirmó `grouped`, versión uno. Los tres escenarios cubren además creación/cambios concurrentes, CAS anterior al no-op, defaults sin efectos, precisión textual, ámbito, RLS con grants adversos, pérdida/restauración de rol y guardas de identidad/versión. El primer intento no se suma otra vez.

La demora usa un trigger adicional exclusivo de la rama de prueba y pg_sleep real; no deshabilita ni sustituye guardas versionadas. Los tests no usan dobles del repositorio, pg, Drizzle ni plataforma. El setup común de Vitest conserva sus polyfills documentados de entorno. Las expectativas SQL inspeccionan la causa PostgreSQL que conserva Drizzle. Lint focal, tipos de producto y tipos de pruebas finalizaron con código cero; git diff --check pasó.

El inventario oficial posterior al proceso actual confirmó producción y el piloto original, con cero ramas temporales. No hubo envíos externos. La revisión consultiva final del checkpoint debe completarse antes de guardarlo. La evidencia sanitizada está en [admission-notification-preference-storage-results.json](admission-notification-preference-storage-results.json). La arquitectura se comprobó en cuatro vistas reales de Chromium/WebKit a 390 y 1280 px, sin overflow; se inspeccionaron visualmente Chromium de escritorio y WebKit móvil.

## Alcance restante

Faltan composición pública, validación de input y DTO en su boundary, API/UI, habilitación del correo con capacidad probada, grupos durables, ventanas de cinco minutos, resumen diario, destinatarios confiables, recordatorio y despacho. El modelo y este storage no acreditan T180/T181/T184 completos, los seis AC de US8, SC-015 ni T211. El [CI de 13758e7a](https://github.com/guidomodarelli/TuTribu/actions/runs/38748055354) terminó aprobado con 5281 casos y build real de 53 páginas; corresponde al modelo anterior y no certifica esta edición posterior. El workflow del siguiente commit conserva su propia obligación de control.
