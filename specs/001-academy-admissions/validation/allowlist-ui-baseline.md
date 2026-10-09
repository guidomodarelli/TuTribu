# Gestión de lista — interfaz y recuperación

Se completa T117 con una carga SSR propia para el líder, segmento con loading/Suspense, container con cuenta/transporte/persistencia y presenter sin adapters. La entrada visible parte de la configuración de admisión. Búsqueda literal, estado y paginación conservan los contratos privados del líder; crear o cambiar una entrada no comprueba el contacto ni concede membresía.

El borrador y la operación pendiente se conservan por usuario/tribu, sin consentimiento. Cada interacción tiene un AbortController y un único slot, con comprobación de cuenta antes/después de las esperas. La pérdida de permiso oculta los contactos. Un 409 de edición mantiene nombre/estado propuestos y exige leer metadata vigente y volver a confirmar con otro UUID; un duplicado de creación tiene feedback distinto sin una recuperación por id inexistente. Una respuesta incierta se consulta por su UUID original y la vista se reconcilia con metadata actual, sin otro POST ni refresh de ruta.

## Evidencia ejecutada

- 21 pruebas locales nuevas/afectadas verdes: hook (12), presenter/container con controles reales (3), SSR con autorización real y puertos propios (4), y adapter con DTO guards reales (2). La ronda conjunta previa cubrió 20; la nueva prueba de recencia exacta y el hook completo terminaron 12/12 verdes en 13,78 s. La regresión inicial de ocho suites pasó 39 casos; los fixes posteriores repitieron sus suites relevantes.
- Lint, typecheck de producto y typecheck de tests verdes. Build final después del fix de búsqueda: compilación 14,5 s, tipos 2,2 s y 47 páginas generadas. No se reconstruyó `.next` mientras estaba activo el server nativo.
- Matriz nativa final: 1/1 caso agregado verde, cuatro combinaciones completas (Chromium/WebKit × 1280/390 px), sin skips, en 1024,81 s. Better Auth/cookies, SQL y claves de fingerprint reales sobre una rama temporal propia. Se observaron dos PATCH con versiones 1/2 y UUID distintos tras una edición concurrente; una creación comprometida con respuesta perdida se recuperó mediante GET sin otra escritura. Navegación de documento permaneció en una, sin errores JS o desborde horizontal. Ocho entradas finales y cero vínculos, con cleanup del server, browsers y rama completado.
- Cuatro capturas reales nuevas con datos sintéticos: lista, conflicto, respuesta incierta y resultado recuperado. Los dieciséis frames anteriores conservan su procedencia; el manual incorpora veinte. Check de manual e índice detallado: cero errores, dos avisos conocidos por documento (local sin share-url y sin catálogo de traducciones). QA final: 24 renders en ambos motores/tamaños, navegación y frames correctos. 147 enlaces locales resueltos sin errores.

## Correcciones y revisión

La revisión detectó y corrigió una omisión al insertar sobre una primera página llena sin actualizar su cursor: ahora se relee esa página propia. También distinguió el conflicto de creación del CAS de edición y ajustó la búsqueda incremental al OR por contacto/nombre usado por SQL, sin concatenar campos. Las regresiones ejercen esos comportamientos. El arnés autenticado descarta el error privado de `route.fetch` y genera un error fijo sin causa.

El primer ensayo nativo terminó rojo en 427,90 s: un selector general encontró una fila de la combinación anterior antes del segundo PATCH. Se corrigió esperando el nombre dentro de la fila del contacto exacto; no se modificaron producto, límites ni expectativas de versión para ocultar el rojo. La matriz siguiente finalizó las cuatro combinaciones y todas las aserciones.

Revisión de código final sin hallazgos: 23/23 hashes estables, manifiesto `2A0203EC776A0757E14CC0A3F5642380F21D5BC38AF822FD8E88A5B936A8F6FC`. Suplemento de código/documentación: 28/28 estables, manifiesto `EC6E2DB35AA1649D56DACE3A867069B9C3DB8C85AF06F9A7EE2F01E4A148F98E`, sin hallazgos. La incorporación posterior de capturas finales, evidencia y trazabilidad se verifica antes del cierre del trabajo.

T117 se cierra por su alcance de gestión de lista. T110/T112/T116 mantienen importación, coincidencia automática y demás alcance pendiente; no se cierra US3 completo ni se declara preparado el runtime general. No se aplicaron migraciones a la rama default ni se realizaron envíos reales de proveedor.

La revisión del delta final conservó 31/31 hashes en `54FC0E2D6186D999110F840F72BDE7A57F11F232DEFE5179BD4C933AD947253A` y comprobó que las cuatro capturas coinciden con sus frames; los dieciséis anteriores permanecen iguales. Detectó únicamente el encabezado de conteo desactualizado en `tasks.md`, corregido a 98 completadas y 114 pendientes. No se alteraron IDs o criterios.
