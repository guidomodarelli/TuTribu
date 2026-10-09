# Endpoints de importación de habilitados

T116 conecta las rutas nativas de preview, lectura actual, confirmación explícita, reporte privado y plantilla con la composición y los casos de uso existentes. El CRUD y listado de habilitados conservan su evidencia en `allowlist-http-baseline.md` y `allowlist-ui-baseline.md`. La pantalla de carga y selección CSV de T118 continúa pendiente; estos endpoints no acreditan ese recorrido ni completan toda US3.

El boundary valida origen, params, query y cuerpo antes de componer almacenamiento. Canonicaliza los UUID, rechaza autoridad aportada por el cliente, aplica los límites propios y liga el DTO público a la operación/importación solicitada. Preview devuelve 201 al crear, 200 al repetir el resultado original y 202 únicamente para una operación started real. La confirmación exige versión positiva y filas únicas explícitas; no se ejecuta desde un GET.

Lectura, plantilla y reporte requieren liderazgo nativo vigente. El reporte usa el snapshot actual autorizado, serializa datos inertes y neutraliza prefijos de fórmula; se descarga como CSV con `no-store`, `nosniff`, `no-referrer` y correlación segura. El resave o transformación posterior de un archivo por una herramienta externa conserva la limitación documentada en la evidencia del serializer.

Las dos operaciones de importación se incorporan a la recuperación original. Esa lectura devuelve el snapshot histórico mínimo de la operación, separado del recurso actual, y revalida sesión, cuenta y liderazgo canónico. No reclama leases, no repite POST y no revela metadata privada de archivo, claves, contactos o proveedor.

## Evidencia ejecutada

- Contratos HTTP: seis casos verdes; origen y autoridad inválidos, límites, selección/versión, canonicalización y vinculación de IDs, estados reales started/replay, denegación sin contactos y reportes privados sin invocar mutaciones. El rojo inicial con el handler todavía pendiente produjo cuatro fallos de comportamiento antes de implementarlo.
- Recuperación original y contratos iniciales: 24 casos verdes en la ronda conjunta; el contrato de recuperación incluye originales started/completed y rechazo de metadata privada. Los dos casos HTTP adicionales se ejecutaron después en la suite de seis casos, también verde.
- Tipos de producto/tests y lint verdes. Build previo: compilación en 35,3 s, TypeScript en 5,9 s y 47 páginas generadas.
- Flujo HTTP nativo: 1/1 verde, sin skips, en 275,09 s. Next real, cookies Better Auth firmadas, recencia y HMAC reales, migraciones versionadas y PostgreSQL en una rama Neon efímera propia. Comprueba 401 anónimo, plantilla de líder, preview con referencia versión 1 y filas propias, GET original, reporte/lista sin efectos, confirmación de una fila válida y omisión de la inválida, replay histórico, CSV neutralizado, una entrada y cero vínculos. Al perder liderazgo, reporte y recuperación quedan cerrados con 403, sin attachment.
- Manuales: `check-manual.mjs` sin errores en el tema y el índice detallado; dos advertencias conocidas por archivo por documento local sin URL publicada y ausencia de catálogo central de traducciones. Veinticuatro renders reales de documentación en Chromium/WebKit a 1280/390 px, cero errores; conserva las veinte capturas existentes y distingue integración disponible de pantalla CSV pendiente.
- `pnpm run ci`: exit 0, 425 suites y 4.407 casos aprobados; 112 suites/427 casos gated no seleccionados. Tests en 563,91 s, build en 12,6 s, TypeScript de build en 2,2 s y 47 páginas. El flujo HTTP nativo se ejecutó por separado con su flag habilitado, sin skip, antes del CI.

## Revisión y alcance

Revisión aislada read-only del código: cero hallazgos accionables, dieciséis archivos estables, hash inicial/final `C82120E6FFBC9242815AD5DF0A0B02BFC6623FABD9B58924D037CF32E3EC7948`; `diff --check` limpio. La observación del reviewer que aún consideraba pendiente el proceso HTTP se concilia con su terminación verde anterior al inicio del CI completo; la revisión no ejecutó pruebas ni modificó archivos.

Revisión documental: cero hallazgos accionables, seis archivos estables, hash `D9C6C23B2380DBF95E5BA6D0B7CE217BD12520058F2AA39379BF715387DE3866`. Su observación de CI pendiente se concilia con el exit 0 posterior. La evidencia final y el marcador T116 sólo se actualizan después de ese resultado; el código revisado permanece idéntico, dieciséis hashes sin cambios.

La arquitectura `.htm`, los manuales propietarios, ambos índices y `CHANGELOG.md` documentan el alcance real. No se ejecutaron migraciones sobre default/producción ni despachos reales de proveedor. T118, matching automático, purga y los alcances de prueba todavía incompletos mantienen sus tareas pendientes. La trazabilidad de los manuales se registra contra el commit del código comprobado antes de publicar su checkpoint documental.
