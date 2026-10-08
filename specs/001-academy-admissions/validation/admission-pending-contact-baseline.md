# Emisión de código para una solicitud pendiente propia

Incremento de T099/T096, separado de las rutas guardadas/subidas en 49ac330f y sus manuales en ddbc790e. Mantiene 97/212 tareas completas y 115 pendientes; no acredita invitaciones, recuperación comercial ni la UI.

9759 TDD SQL terminó rojo en 31,89 s con cleanup: el owner rechazaba invalid_input antes de reclamar por no admitir admissionRequestId. Se incorpora lectura de la pendiente común propia bajo FOR SHARE, con estado/source/contacto y reloj SQL fresco después de la espera. La autorización de presupuesto/emisión repite esa comprobación hasta el commit. Pedir un código no cambia la solicitud, el contacto, proof, binding, versión o fechas originales.

44349 no quedó verde: el test no informó fallo funcional, pero el cleanup no confirmó ausencia de br-sparkling-shape-ang041lt por timeout de la CLI. Después de finalizar el proceso se consultó el recurso y se verificaron id, nombre único, parent y default=false contra el receipt del ensayo. La eliminación de esa rama exacta terminó y su ausencia se confirmó en la lista del proyecto; ninguna rama ajena se modificó. La ejecución completa 69882 pasó tres SQL en 147,38 s con cleanup confirmado. También imprimió la confirmación de ausencia de la rama del ensayo anterior.

Además de primera emisión/replay y referencia inexistente, se prueban un contacto ya fijado incompatible y una pendiente vencida. Ambos deben cerrar antes del claim, con cero códigos/entregas/eventos/pruebas/membresías y snapshot original intacto. Los tiempos del fixture usan las constantes reales de vigencia y conversión. Tres suites locales pasaron 51/51 en 1,65 s; tipos de producto/tests, lint focal y diff-check pasan.

Arquitectura y CHANGELOG acompañan el comportamiento. La nota de disponibilidad interna ya refleja la emisión pendiente y conserva la pantalla como no disponible; source-trace y el checkpoint de manuales se actualizarán contra el commit del código. No se cierra el incremento hasta su SQL, revisión y validación documental finales.

QA de arquitectura: cuatro renders finales Chromium/WebKit1280/390, sin overflow/pageerrors. Revisión Codex independiente de cuatro archivos cerró con cero hallazgos accionables; manifiesto inicial/final 01686B0E31CC5F88FCC78AE457DB26628AD09DA0C556AE587015B03FB25887E2 y cuatro hashes intactos. Los endpoints existentes conservan sus guards y el nuevo alcance sigue limitado a la pendiente común propia. El checkpoint de manuales se registra después del commit del código para conservar una referencia real.
