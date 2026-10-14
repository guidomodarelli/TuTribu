# Cierre de ámbito, original de tribu y resultados tardíos

Base: `1012afde98286541844cf2e606663cfe254c4a94`, rama `feature/academy-admissions-spec`.

La migración idx159 añade una referencia separada al original de ciclo de vida. La misma transacción prepara ese original autorizado, registra los efectos y lo revierte si vence la confirmación o falla el cambio. La referencia exige el mismo actor SQL y UUID de tribu; no reutiliza el ledger de admisión ni atribuye una acción humana a un cierre directo. Los hechos de sistema conservan actor nulo.

El cierre registra las cancelaciones efectivas de cola sin intento. La salida de academia mantiene el diagnóstico; la eliminación física cancela los fines elegibles antes del archivo. La copia privada conserva hechos seleccionados de transporte y prueba, referencias opacas, versión y reloj, incluso después de eliminar recursos temporales. Mantiene las cuatro causas cerradas de cancelaciones locales anteriores; descarta metadata arbitraria y contacto/código. No devuelve consumo ni cambia intentos, reservas o leases ya comprometidos.

Una prueba real reprodujo el fallo del resultado posterior al borrado. La inspección mínima mediante `pg` identificó `23503`, tabla `academy_admission_audit_events`, constraint `admission_audit_tribe_fkey`: el registro intentaba referenciar una tribu operable inexistente. El helper registra ahora el resultado monotónico en el archivo privado, tomando el original de la creación archivada; no lo vincula al comando de eliminación. También conserva el resultado recibido antes del borrado. El diagnóstico temporal se retiró del test.

Validación actual:

- 43 casos locales aprobados, cero fallos u omisiones, en contratos de auditoría, métricas y casos de uso de ciclo de vida.
- Tipos de producto y tests, y lint aprobados. Se corrigió el tipo explícito del receipt del test tras la primera comprobación.
- Build real aprobado en copia administrada aislada; tres fuentes de producto coinciden antes y después. No se ejecutó el build en el checkout del piloto.
- La primera ejecución focal falló antes del fixture por una lectura administrativa; una lectura oficial posterior confirmó proyecto y nombre. La segunda reprodujo el fallo de receipt y la tercera obtuvo el diagnóstico `pg`; sus informes se conservan.
- La matriz Native inicial terminó con 21 aprobados / 1 fallo / 0 omisiones sobre trece fuentes. El fallo fue un parámetro ambiguo del fixture: pg confirmó 42P18 en una lectura mínima con savepoint; se añadieron casts de texto sin debilitar el control de redacción. Dos intentos del arnés diagnóstico privado no válidos no se computan como evidencia aprobada.
- Una repetición enfocada aprobó 6 / 0 / 13 y añadió una prueba de archivo para cuatro causas locales. La última repetición volvió a aprobar 6 / 0 / 13 sobre catorce fuentes finales congeladas, incluyendo la eliminación previa de prueba, desafío y entrega temporal. En total son 23 casos Native distintos aprobados; se preservan el fallo inicial y el alcance de los filtros. No se presenta una ejecución completa final que no ocurrió.
- La documentación aprobó cuatro vistas Chromium/WebKit a 390/1280 px, con enlaces y ancla válidos, sin desbordes ni errores; las dos vistas móviles se inspeccionaron. La revisión Codex de dieciocho archivos quedó sin hallazgos y cotejó sus hashes iniciales/finales. La lectura oficial posterior confirma ausentes las treinta y seis ramas propias de validación, conservando la del piloto. El archivo oficial de la copia de build quedó solicitado y su confirmación permanece pendiente.

No acredita el cierre de T169/T170, los demás productores, actividad, métricas efectivas, ventanas de retención, rollout o gates. Se conservan los criterios originales y los 164 completados / 48 pendientes / 212 totales.

El piloto no realizó nuevos envíos. Su proceso y PID anterior dejaron de estar disponibles y HTTPS devolvió `ECONNREFUSED`. La lectura oficial y pg de solo lectura confirmaron que la rama propia sigue presente y conserva una candidata con secreto cifrado; las claves de hosting generadas en el antiguo proceso no están en la configuración local. No se regeneraron protecciones ni se sobrescribió la conexión. La recuperación del piloto conserva ese límite pendiente.
