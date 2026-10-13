# Consulta y rutas de lista

Incremento de T110/T112/T116 sobre `3c0789783bda8c7490db4fd582f0b6c74aa2dc52`; mantiene 97/212 tareas completas y 115 pendientes.

Se conectaron consultas por líder, búsqueda literal, filtros por estado, keyset de fecha/id y DTOs propios. El cursor conserva microsegundos de PostgreSQL. El mapper compartido no agrega schema-validation de filas. La salida omite actor, importación privada, propietario y fingerprint. Las rutas Next GET/POST de lista y GET/PATCH de entrada validan inputs una vez y ligan resultados al UUID, entrada y versión originales. El namespace propio permite recuperación GET por el actor/líder actual, sin modificar leases o repetir comandos. Vista actual e historia permanecen separadas.

## Evidencia

- Lector SQL real: 1/1 verde en 44,17 s (42,250 s el caso), con cleanup; tres filas separadas por microsegundos, wildcard como dato literal, aislamiento de tribu, proyección sin privados, cero operaciones y pérdida de liderazgo.
- Handlers/orquestación: 10/10 verdes en dos suites, sin skips, en 868 ms. Input inválido se rechaza antes de abrir la composición; DTO cruzado se rechaza con el status interno 500 vigente.
- Regresión conjunta de rutas/recuperación: 73 verdes en siete suites, con un caso SQL no seleccionado, en 16,04 s.
- HTTP Next real final: 1/1 verde, sin skips, en 232,58 s (230,818 s el caso), con cookie firmada, recencia nativa, SQL/crypto reales y cleanup confirmado. Comprueba 401 anónimo, GET sin efectos, creación/replay, PATCH CAS, rechazo de versión cero y stale, entrada actual en versión dos frente a original en versión uno, ausencia de privados, filtros y pérdida de liderazgo sin nuevas membresías/vínculos.
- Tipos producto/tests y build real verdes: 37,3 s de compilación, 10,0 s de TypeScript y 46 páginas. El build queda inmóvil mientras corre el HTTP nativo.

El primer ensayo HTTP falló en preparación con PostgreSQL 42703: faltaba la migración del marcador antes del reader público. Se corrigió aplicando `20261005093000_guard_academy_membership_sources.sql` primero. El ensayo siguiente completó las aserciones, pero falló por timeout de eliminación y rama todavía presente. Se verificó id/nombre/parent/default de la rama propia, se eliminó y se confirmó su ausencia; no se modificó el helper ni su deadline para ocultar el fallo. Otra repetición falló readiness y completó cleanup. El helper recibió sólo diagnóstico de estados HTTP/contador/booleano de proceso, sin cuerpos/headers/env/cause ni cambio de deadline; la ronda final terminó verde.

El manual y sus índices distinguen la integración backend del panel/CSV todavía ausentes. Se conservaron las capturas previas, sin crear una pantalla ficticia. Checks de manual: cero errores y dos avisos conocidos por documento (archivo local sin share-url y sin catálogo de traducciones). QA real: 24 renders Chromium/WebKit a 1280/390 px, sin desbordes, fallos de frames, navegación o errores JS. Se comparó el código registrado `d29112c` con HEAD; la trazabilidad se actualizará al commit del código conectado después de validarlo.

Revisión Codex read-only final cerrada sin hallazgos sobre 22 archivos: manifiesto `F65D1E54D9C046582CCC8089C2090F54DE4028479A94F08A6AC1D654040FDBD6`, 22/22 hashes estables. La ronda previa de 21 archivos conservó `8F8BF489DF17BEB8C721DC66248A03F1AFDAC94EF43EDFFE8123D14B5A398696`; el manifiesto inicial `9C33BA21EBFA1493EA519E11216D789E9D3C0BB80E8A7783FEC1D9613A6E3929` sólo cambió por la preparación HTTP. No hubo fallback ni diagnósticos materiales.

El backend de lista queda conectado; todavía no hay pantalla de gestión o importación, ni integración de coincidencias automáticas. La documentación distingue esa disponibilidad. No se cierran T110/T112/T116 ni gates por una integración parcial. No se ejecutan migraciones en producción ni envíos reales de proveedor.
