# Matriz canónica de interfaz: 28 casos

T198/T208 permanecen pendientes. `playwright.admissions.config.ts` descubre veintiocho casos de cinco archivos, con Chromium/WebKit a 390/1280 por 900 px y un worker. Los ensayos usan ramas efímeras, Next y librerías reales. Los escenarios de códigos instalan el transporte HTTP cerrado propio; no salen mensajes a Zavu ni a los destinatarios del piloto.

## Primer resultado y diagnóstico

El primer intento de lanzar ambos reporters se detuvo antes de ejecutar pruebas porque PowerShell separó el argumento que contenía una coma. La ejecución posterior usó el CLI instalado directamente y el argumento completo entre comillas. Descubrir los veintiocho casos no se presenta como ejecución.

La primera ejecución efectiva terminó con **un caso fallido, cero aprobados y veintisiete sin ejecutar**. El ingreso manual en Chromium a 390 px mostró «El recurso solicitado no está disponible» después de presentar; no llegó a pendiente. El límite de primer fallo detuvo la matriz, sin convertir los casos restantes en aprobados.

El [diagnóstico directo con `pg`](admission-manual-host-keyring.json), en otra rama efímera y con rollback, comprobó que el scope y la sesión del aspirante eran utilizables para ese rol. PostgreSQL reconocía las dos referencias HMAC registradas por el fixture y rechazaba las claves diferentes que el servidor generaba por defecto. No se leyeron ni imprimieron claves, verifiers, contactos o filas de personas. La primera sonda usó por error una función privada que puede registrar referencias y el modo READ ONLY impidió su INSERT; la sonda final llamó la comparación autorizada que usa el request. Otro intento de preparación incumplió la igualdad del instante de activación y fue corregido para reproducir el seed original. No se atribuyen esas sondas fallidas al producto.

La corrección de `academy-admissions-manual.spec.ts` genera una sola configuración privada con seis propósitos, la entrega a `prepareContactVerificationDatabase` para su registro y pasa el mismo material a `withAdmissionNextServer`. No cambia la aplicación, las políticas RLS, el control de continuidad ni las expectativas de ingreso y privacidad. Tipos del proyecto E2E y lint focal pasan.

## Punto de control de la repetición completa

La segunda ejecución volvió a iniciar los veintiocho casos. El primer caso, que antes fallaba, **aprobó en aproximadamente 2,4 minutos** y confirmó su limpieza; el siguiente caso administrativo comenzó en otra rama propia. La matriz sigue en ejecución y el resto no está acreditado todavía. Sus inputs y recibos de propiedad se conservaron antes de comenzar, para comprobar estabilidad y limpieza al terminar.

El segundo caso, de teclado administrativo, resultados mixtos y recuperación tras perder la respuesta, aprobó también en aproximadamente 3,9 minutos. Este punto de control acredita dos casos completados; no se suman los demás como aprobados. La convención actualizada pasó cuatro vistas Chromium/WebKit a 390/1280 y ocho destinos locales, sin errores, desbordes o cambios de inputs.

El diagnóstico utilizó el rol propietario de esa rama; `row_security_active` era falso. No se usa como prueba de RLS con un rol sin bypass. Los ensayos de permisos y RLS conservan sus evidencias y alcance independientes. Cero mensajes reales y ningún cierre de tarea o gate por este punto de control.
