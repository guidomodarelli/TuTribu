# Modelo privado de preferencias de avisos

Checkpoint parcial de T180. Al capturar esta evidencia, las 212 tareas originales conservan **174 completas y 38 pendientes**. T177, T180, T181 y T184 mantienen su alcance: este modelo todavía no dispone de persistencia, grupos, API ni controles de usuario.

`resolveAdmissionNotificationPreference` consume hechos actuales del servidor. Exige un líder o guardián activo de la tribu y rechaza un registro de otra cuenta o tribu. La ausencia de registro produce el default agrupado para el líder y omitido para guardianes, con versión implícita cero y sin inventar fecha de habilitación. Una elección explícita conserva su modo cuando cambia el rol entre responsables activos. La conexión, el check de admisión y la disponibilidad del proveedor tienen su configuración independiente.

`planAdmissionNotificationPreferenceChange` compara la versión observada antes de proponer un cambio. Confirmar el mismo valor que el default propone el primer registro explícito. Una elección explícita idéntica conserva versión y fecha originales; cambiar modo propone la siguiente versión y retiene el texto del timestamp autoritativo sin perder precisión. El llamador deberá obtener esos hechos y ese reloj del servidor y aplicar el plan con CAS y revalidación dentro de la transacción; el plan puro no acredita una escritura concurrente real.

La política devuelve razones privadas cerradas y una proyección mínima, sin proveedor, contacto ni nota interna. Los DTOs públicos, sus validadores y el mapeo seguro permanecen en las tareas de integración.

## Validación de esta base

El [manifiesto de resultados](admission-notification-preference-model-results.json) registra **19 casos aprobados, cero fallos y cero filtrados** en el archivo completo, con fuentes estables. Se ejecutaron en Node real, sin dobles de SDK o persistencia:

- Dos defaults por rol y cuatro modos explícitos conservados.
- Cinco cambios de autoridad que impiden lectura y cambio de preferencias.
- Dos conflictos de ámbito que rechazan el registro ajeno sin devolverlo.
- Primera elección explícita, no-op que conserva el origen y cambio que conserva la precisión del reloj.
- Dos versiones obsoletas y un intento de crear sin la versión implícita original.

Lint focal y tipos de producto/pruebas pasaron. La documentación pasó cuatro vistas reales Chromium/WebKit a 390/1280, sin desbordes y con el enlace local disponible. Se inspeccionaron las capturas finales de escritorio Chromium y móvil WebKit. El [CI de 521aaf7d](https://github.com/guidomodarelli/TuTribu/actions/runs/38741795440) pasó con 5262 casos, 780 omitidos y build real; corresponde al checkpoint anterior de fixtures, no a este modelo posterior.

Las pruebas Native de preferencias, agrupación durable, no envío retroactivo, destinatario confiable, dispatcher, reintentos y UI mantienen T177–T191. El recordatorio de tres días, zona de la tribu, resumen de las 09:00 y los seis criterios de US8 conservan sus requisitos completos. No se activan envíos ni se cierran tareas por esta base privada.
