# Preparación actual de la activación de admisión

Base `d0ae5ddd`, 159 completas/53 pendientes/212. T161 conserva su alcance original y permanece abierta para SourceTrace, QA documental y auditoría de cierre final. Native, HTTP y navegador están comprobados por sus scopes exactos. Los gates de rollout y el ensayo completo de restore mantienen sus tareas separadas.

## Cambios actuales

El inventario SQL exige además el constraint trigger de decisión habilitado, lee el indicador de admisión de la academia y consulta el bloqueo efectivo de recuperación del hosting sin cargar keyrings. La composición usa el runtime real del writer instalado; no sustituye su cobertura por un booleano fijo. El resultado público conserva únicamente motivos allowlisted y los dos contadores agregados de historia comercial desconocida y membresías comerciales restringidas privilegiadas.

La interfaz muestra los motivos seguros y el impacto antes de confirmar; limpia el resultado y su disponibilidad al editar, consultar, iniciar otra comprobación o escribir. Las resoluciones de historia/roles siguen siendo autorizadas y auditadas por el owner de membresías; no se agrega una pantalla de recuperación ni se modifica una membresía desde el preflight.

## Evidencia actual y límites

- Validación local: 40 casos finales aprobados/cero omitidos, incluyendo distinción de canal/cupos, requisitos seguros conocidos y OFF independiente en las suites de formulario/container, dominio y use case de preflight.
- Tipos de producción/tests y lint pasan. Build actual termina exit0 (`codex-t161-final-scope-build.log`).
- Revisión inicial de catorce fuentes: cero hallazgos y manifiesto `E5A8576B6CA79E40E48F451F8461345C5D3167BF462ECBF718A45C1187281E63`; el rerun actual posterior a la distinción de canal/cupos se detalla abajo.
- Native actual comprobado en tres casos seleccionados: runtime real, preview positivo, indicador apagado, recovery lock, trigger de decisión deshabilitado/restaurado, contadores sin backfill y activación real con relectura posterior a preview. El lote termina exit0 con tres aprobados y trece casos fuera del filtro; esos filtros no se acreditan. La regresión separada de historia/privilegios termina exit0: un aprobado, diecisiete casos fuera del filtro (`codex-t161-current-history-regression-native.json`).
- Las expectativas históricas HTTP/navegador distinguen ahora inventario preparado de ON sin canal operativo: el primero puede quedar preparado y la activación sigue denegada por readiness. Se conserva el contrato readonly sin keyrings. La nueva presentación diferencia ese scope, informa preparación not_evaluated con ON y muestra requirements seguros conocidos; OFF no exige preparación de mensajería. El HTTP real y la pantalla nueva en Chromium/WebKit a 1280/390 terminan exit0: tres casos aprobados, quince fuera del filtro (`codex-t161-current-http-impact-browser.json`). El recorrido previo de conflictos, borrador y consulta actual termina exit0: dos casos, dieciséis fuera del filtro (`codex-t161-current-policy-browser-final.json`).
- La atomicidad previa de policy/marcador y rollback/readiness está en `admission-policy-baseline.md`; el cierre por pérdida de configuración y retiro de scope está en T156/T160. No se atribuye un ensayo completo de restore a los rechazos de recovery lock.

Arquitectura, changelog y texto de tres manuales/índices incorporan los bloqueos y agregados. Se conservaron scripts y capturas anteriores; el estado nuevo agrega una captura real y conserva los 46 frames anteriores. Faltan la QA final y el SourceTrace al checkpoint probado.

## Receipts y alcance verificado

Los nueve Native acreditados se separan por sus scopes: tres de inventario/runtime/activación, uno de historia/privilegios, un HTTP y cuatro casos de navegador en ambos motores y tamaños. Los filtros no se presentan como aprobados; el intento inicial con un patrón que seleccionó cero casos se conserva sin acreditar. Las 40 pruebas locales no se confunden con esos Native. Todos los recursos y servidores propios están cerrados antes de los terminales respectivos.

El mismo reviewer repite la fuente actual con cero hallazgos y catorce hashes estables: `C01252FC29E7669CD6BFEC89118FC4BCA156B3768977C3FCED513FED82232CF2`. El build final, tipos y lint pasan. GET preflight conserva el inventario sin keyrings ni RPC; el HTTP comprueba inventario preparado con códigos ON y deniega activar mientras el canal no esté preparado. La inicialización y el borrador conservan cero admisiones/envíos. La activación OFF actual compara policy/marcador en el mismo instante y relectura tras cambiar el indicador entre preview y confirmación.
