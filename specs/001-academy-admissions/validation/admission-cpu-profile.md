# Muestreo de CPU del runtime de carga

El ensayo de 8 CU conserva un p95 de 5.341,00 ms, superior al criterio de tres segundos, y registra CPU user/system y event loop activo. El diagnóstico siguiente atribuye ese trabajo antes de modificar otra parte de la aplicación. T200/T209 y las catorce tareas pendientes mantienen su alcance.

## Protocolo

`ADMISSION_NODE_PROFILE_CPU=1` habilita muestreo mediante `node:inspector/promises` sólo en el host efímero autenticado y fijado a la rama propia. Se usa `Session.connect` y el dominio `Profiler`, con intervalo de mil microsegundos; no se abre un puerto de depuración ni se solicitan argumentos, variables locales o snapshots de memoria. La API se contrastó con la [documentación oficial de Node](https://nodejs.org/api/inspector.html#cpu-profiler), y su compatibilidad efectiva se comprueba al ejecutar el producto en el target.

El muestreo abarca calentamiento y carga; el seeding queda fuera. Sus tiempos inclusivos se superponen entre frames y no pueden sumarse como costos independientes. `projectAdmissionCpuProfile` conserva nombres de símbolos de código acotados, categoría de fuente, línea/columna, tiempos y contadores. Descarta URLs, script IDs y campos adicionales. El perfil completo se mantiene en memoria hasta esa proyección y no se escribe en archivo ni se devuelve al cliente. La observación distingue idle, garbage collection y muestras sin atribución.

Un profiler no disponible genera un estado propio explícito; la carga se ejecuta y su resultado se conserva. La prueba opt-in exige un perfil real con muestras, además de los controles originales de cien resultados, efectos, replay y latencia. El cierre desconecta la sesión también ante un fallo. El modo ordinario mantiene el perfilador deshabilitado; una corrida instrumentada no reemplaza la medición de aceptación sin profiler.

## Validación inicial

Seis casos de proyección pasaron después de reproducir el módulo ausente: contabilidad de hojas/ancestros, descarte de campos privados, idle/GC, ausencia de atribución, deltas inválidos, ciclos y muestras inconsistentes. Pasaron también los ocho casos del handler autenticado, los tipos de tests y lint. Registros privados: `.git/admission-cpu-profile-red.json`, `.git/admission-cpu-profile-green.json`, `.git/admission-cpu-profile-types.log` y `.git/admission-cpu-profile-lint.log`. La integración y el resultado real se registran por separado antes de acreditar que el target soporta el muestreo.
