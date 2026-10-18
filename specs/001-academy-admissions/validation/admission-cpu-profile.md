# Muestreo de CPU del runtime de carga

El ensayo de 8 CU conserva un p95 de 5.341,00 ms, superior al criterio de tres segundos, y registra CPU user/system y event loop activo. El diagnóstico siguiente atribuye ese trabajo antes de modificar otra parte de la aplicación. T200/T209 y las catorce tareas pendientes mantienen su alcance.

## Protocolo

`ADMISSION_NODE_PROFILE_CPU=1` habilita muestreo mediante `node:inspector/promises` sólo en el host efímero autenticado y fijado a la rama propia. Se usa `Session.connect` y el dominio `Profiler`, con intervalo de mil microsegundos; no se abre un puerto de depuración ni se solicitan argumentos, variables locales o snapshots de memoria. La API se contrastó con la [documentación oficial de Node](https://nodejs.org/api/inspector.html#cpu-profiler), y su compatibilidad efectiva se comprueba al ejecutar el producto en el target.

El muestreo actual comienza después del calentamiento y termina después de fijar los tiempos de la cohorte, antes de consultar sus contadores finales. El primer ensayo también incluyó calentamiento y conserva ese alcance en su artefacto histórico. Los tiempos inclusivos se superponen entre frames y no pueden sumarse como costos independientes. `projectAdmissionCpuProfile` conserva nombres de símbolos de código acotados, categoría de fuente, línea/columna, tiempos y contadores. Descarta URLs, script IDs y campos adicionales. El perfil completo se mantiene en memoria hasta esa proyección y no se escribe en archivo ni se devuelve al cliente. La observación distingue idle, garbage collection y muestras sin atribución.

Un profiler no disponible genera un estado propio explícito; la carga se ejecuta y su resultado se conserva. La prueba opt-in exige un perfil real con muestras, además de los controles originales de cien resultados, efectos, replay y latencia. El cierre desconecta la sesión también ante un fallo. El modo ordinario mantiene el perfilador deshabilitado; una corrida instrumentada no reemplaza la medición de aceptación sin profiler.

## Validación inicial

Seis casos de proyección pasaron después de reproducir el módulo ausente: contabilidad de hojas/ancestros, descarte de campos privados, idle/GC, ausencia de atribución, deltas inválidos, ciclos y muestras inconsistentes. Pasaron también los ocho casos del handler autenticado, los tipos de tests y lint. Registros privados: `.git/admission-cpu-profile-red.json`, `.git/admission-cpu-profile-green.json`, `.git/admission-cpu-profile-types.log` y `.git/admission-cpu-profile-lint.log`. La integración y el resultado real se registran por separado antes de acreditar que el target soporta el muestreo.

## Primer perfil real

El [ensayo de 0b7d9e73](admission-cpu-profile-first.json) acreditó el profiler nativo: 2.234 muestras sobre 9.446,76 ms, con alcance `warmup_and_workload`. Se observaron 3.567,63 ms atribuidos a idle y 877,60 ms a garbage collection; los demás frames incluyeron protocolo PostgreSQL, escrituras, certificados y microtareas. Esos tiempos proceden del muestreo y no sustituyen CPU user/system ni permiten sumar los frames inclusivos como partes independientes.

El calentamiento contiene conexiones iniciales, por lo que ese perfil no basta para elegir una modificación del recorrido medido. La carga preservó sus cien resultados y falló el p95 instrumentado de 5.750,14 ms frente a tres segundos. Función/rama propias se eliminaron y se confirmaron las tres ramas anteriores. Se conserva el primer perfil antes de aislar las confirmaciones; el caso siguiente usa callbacks de observación propios, sin cambiar SDKs, comandos, warm-up ordinario, límites o resultados esperados.

## Perfil limitado a la cohorte

El [resultado de da15f57b](admission-cpu-profile-scoped.json) acreditó el alcance `workload`: 1.093 muestras sobre 5.835,18 ms, con 1.721,41 ms atribuidos a idle, 351,78 ms a GC y cero muestras sin atribución. Los frames principales incluyen microtareas, protocolo, escritura de buffers y actividad nativa; no aparece en el top una única función de generación SQL que permita explicar toda la latencia. Estos datos de muestreo incluyen huecos de planificación y tiempos inclusivos superpuestos; no se convierten en porcentajes de CPU por solicitud.

Las cien operaciones conservaron los resultados esperados y el p95 instrumentado de 5.507,38 ms siguió fallando frente a tres segundos. La función y rama propias se eliminaron y sólo permanecieron las tres anteriores. El siguiente contraste reduce la concurrencia física del pool, conservando las cien solicitudes simultáneas y contabilizando sus esperas; se mide sin profiler y se registra por separado.
