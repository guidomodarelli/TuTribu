# Admisión común por lista — avance transaccional

Este checkpoint integra `common/allowlist` en el writer existente, junto con la revisión manual común. Conserva abiertas T107/T111/T112/T113 y T120: la matriz personal/legacy, la muestra persistida completa y otros criterios de esas tareas todavía no están acreditados. El conteo continúa en 103 completadas y 109 pendientes de 212. El runtime de activación exige todas las fuentes y permanece cerrado; no se aplica ninguna migración a la rama por defecto ni se afirma un rollout productivo.

## Comportamiento y responsabilidades

- El dominio propone una decisión automática sólo con contacto exacto, cuenta/evidencia aplicables, entrada habilitada y versión positiva. Correo conserva puntos/etiquetas; teléfono usa la prueba local de contacto canónico.
- El adapter obtiene y bloquea los hechos actuales. El owner de presentación confirma request, vínculo, consumo de prueba cuando corresponde, decisión `system/automatic`, membresía básica, auditoría y aviso aprobado en un único commit. No emite un aviso de solicitud pendiente para un ingreso automático.
- El vínculo y la lista son entidades distintas. El ingreso no edita nombre/estado/version de la entrada. La decisión almacena privadamente la entrada/version consumidas mediante una migración versionada, con FK de tribu, par consistente e historia inmutable.
- Una falta de coincidencia sólo abre una solicitud común cuando la política permite excepciones y la cuenta explica su pedido. Una entrada agregada posteriormente no aprueba esa pendiente. La resolución exige reviewer actual y motivo interno; no edita ni reactiva la lista.
- La revisión usa la captura base original y relee los hechos después de los locks `user → account → capture`, compatibles con el owner de auth. OFF con excepciones permitidas conserva una decisión explícita de contacto declarado sin crear vínculo. La aprobación directa de sources personal/legacy se deniega en el writer, independientemente de lo que pueda leer la UI.
- Los códigos compartidos usan un contrato union explícito comprobado con `satisfies`; no se deriva el contrato desde un objeto runtime. Inputs y DTO propios conservan sus guards; filas PostgreSQL y payloads de proveedores se consumen sin revalidación de schema.

## Evidencia confirmada

- Propuestas locales: tres casos originales verdes; la muestra sintética pura de mil contactos produce ochocientas propuestas automáticas y doscientas revisiones. No se atribuye a este test una persistencia de mil membresías.
- Primera integración OFF: rojo nativo real por modo no soportado, luego un caso verde en 76,26 s. Captura base/vínculo/decisión de sistema/membresía/aviso aprobado/replay y conservación de entrada comprobados.
- Integración ON: dos casos nativos verdes para correo y teléfono en 286,21 s, usando emisión/verificación/MAC/envelope reales y aplicación de prueba propia; sin RPC a mensajería productiva.
- Excepción base: primer rojo de revisión, luego un caso verde en 106,37 s; la entrada posterior conserva pending hasta la decisión explícita, sin cambio de lista.
- P2 source: una aprobación legacy indebida quedó reproducida en 71,69 s. El writer la cierra; la última suite con fixtures históricos legacy y personal válidos pasó en 99,53 s, preservando pending/version y ausencia de miembros/decisiones.
- P2 concurrencia: capture nativo invalidaba el original durante la aprobación, reproducido en 99,48 s. Tras el fix, la misma carrera pasó en la ejecución de 103,19 s: el capture real espera a la decisión y se conserva la referencia original. Esa ejecución tenía otro test fallido exclusivamente por un oráculo `error` en lugar de `failure`; se corrigió contra el contrato real y la suite source posterior quedó verde.
- Las omisiones iniciales de `displayName` fueron detectadas por typecheck y corregidas. El segundo test de excepción también tuvo un oráculo `error` incorrecto; su resultado rojo no se trata como aprobación de todo el escenario.
- Tipos de producto/tests y lint verdes; cuatro suites locales relevantes, once casos verdes en 3,04 s.
- Check-manual de admisión, ingreso e índice detallado sin errores. Dos advertencias conocidas por archivo: guía local sin URL compartida y sin catálogo central de traducciones.
- Excepción final ampliada: dos casos nativos verdes en 243,38 s. Incluye motivo requerido, contacto declarado sin vínculo con OFF/excepciones ON, aprobación explícita y denegación de captura original revocada cuando se deshabilitan excepciones.
- Documentación: 185 enlaces/anclas válidos; veinticuatro renders Chromium/WebKit a 1280/390 px sin desbordes ni errores. Los JSON de capturas existentes permanecen idénticos a HEAD; no se presentan nuevas capturas ficticias de rollout.
- Revisión final de código: cero hallazgos accionables, 21 hashes estables, target `83F3669CDA798227498D7A6DE4EAA2BD134F6B7EE4AF5497DFE0C0D2114D4C67`. Tras corregir sólo dos comentarios JSDoc obsoletos, el target pasa a 22 archivos y se revisa nuevamente; no cambia lógica ni se descarta evidencia de tests.
- Última revisión de código: cero hallazgos, 22/22 hashes estables, target `FFB2FBDB20857F1A417226DA1861A78E9D3FA8C97DD321AE1516D7DF2724612E`. Revisión documental detectó dos P3: frase residual de disponibilidad y changelog sin precondición modo lista. Ambos corregidos y revisión final limpia, seis hashes estables, target `8F324E05BF1020C1BA4FD5CFCE14782E3276471914EC30A752905B3829AF7620`.
- CI completa terminó con exit 0: lint y ambos typechecks aprobados; 433 suites y 4.431 tests verdes en 751,39 s, con 119 suites/436 casos gated. Build Next de producción compiló en 55 s, TypeScript en 10,9 s y generó las 48 páginas. No se atribuye cobertura nativa a los skips.
- Regresión manual nativa completa: quince casos verdes en 1.187,28 s, exit 0. Conserva cancelación/rechazo durante pausa, prueba aplicada, expiración después de locks, recuperación comercial, rollback de obligación omitida, replay/lectura originales, revocación de reviewer y recencia exacta de reintento. Todas las ramas pertenecen al run y el helper terminó después de su cleanup.

Todas las ejecuciones de CI, pruebas SQL y QA de este checkpoint terminaron. Las revisiones finales de código y documentación cerraron sin hallazgos. Se conserva el fallo terminal de la ronda previa y no se usa como revisión limpia. No se envían mensajes reales ni se modifican login, recuperación o vinculación global.

## Guardado y trazabilidad final

El checkpoint funcional `516ace3f9ccf9131caa350e5d1895e87d2fcd6ca` se commiteó y subió a `feature/academy-admissions-spec`. Las cuatro guías comparan sus scopes anteriores con ese código y registran la nueva fuente mediante `source-trace.py`, conservando los paths previos y agregando seis owners: 50/30/59/59 scopes finales. Metas y footer apuntan al commit funcional; scripts, templates/JSON, refit, estilos y navegación permanecen idénticos.

Check-manual posterior sin errores y mismas dos advertencias conocidas; última matriz de veinticuatro renders Chromium/WebKit 1280/390 pasó con cero errores. La revisión focal de los cuatro archivos cerró sin hallazgos y hashes estables, target `47C37335AA98DB53174205C15D3439E79710D4A81EE970702387FCF322455B30`. No se repite CI del producto por este cambio exclusivo de trazabilidad. El objetivo completo conserva 109 tareas pendientes.
