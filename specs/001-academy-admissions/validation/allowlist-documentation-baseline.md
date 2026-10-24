# Documentación de lista, CSV y acceso

T119 completada: integra la documentación propietaria de T117/T118 con las reglas de vinculación y acceso, sin declarar completo matching, excepciones en modo lista, nominativas, recuperación general o purga. Se conserva la especificación normativa y sus checklists; se completa el contrato HTTP con la descarga de plantilla realmente implementada.

## Cobertura y fuentes actuales

| Alcance de T119 | Documento y evidencia |
| --- | --- |
| Crear/buscar/filtrar/estado y versiones | Manual propietario `#allowlist-integration`, arquitectura y evidencia T117; API/use cases actuales, líder/recencia, CAS y resultados originales |
| Plantilla/límites/preview/selección/resultados | `#allowlist-import-integration`, T118, endpoints propios y serializer; UTF-8/coma, dos encabezados, diez mil filas/cinco MiB, filas inválidas sin selección y preview sin efectos |
| Progreso parcial/reanudación/reporte/retención | Mismo owner y T115/T118: originales separados de filas temporales, pendientes explícitos, CSV inerte, IndexedDB local/sesión y purga del servidor pendiente |
| Habilitación frente a membresía/evidencia | `#allowlist-access-boundaries` y arquitectura: lista no comprueba contacto, fija vínculo o crea/expulsa miembros; coverage comercial conserva su owner |
| Coincidencia y excepción separada | Matriz del dominio y spec FR-017/018/073/075/096/097, con disponibilidad explícita: perfil real `common/manual_review/localProof`; matching/excepción de lista siguen pendientes y no se inventan botones |
| Vinculación/corrección | `#allowlist-contact-ownership`, `AdmissionContactBinding` y writer de prueba real: se fija al presentar/aplicar a pending, no por dato/código aislado; rechaza otro owner y no se transfiere por perfil/lista/cancelación |
| Orientación de ingreso e índices | `joining-options.html#admission-allowlist`, enlaces de ida/regreso al owner y ambos menús; corrección general y nueva vía de recuperación no se presentan como existentes |
| Contrato de frontera/changelog | GET template agregado con audiencia/read-only/headers; original mínimo separado del recurso temporal. Unreleased ya registra lista/API/pantalla; este work item sólo modifica documentación y no agrega una nueva conducta de producto |

El writer instalado y `MANUAL_ADMISSION_EXECUTION_CAPABILITIES` se inspeccionaron directamente. Las reglas puras de `admission-eligibility` no se trataron como un recorrido automático operativo. El writer de aplicación de prueba comprueba owner y referencia propios, preserva la pendiente y registra el vínculo en el mismo commit; los informes previos de pruebas PostgreSQL y los tests actuales lo sustentan. No se afirma una transferencia ni una pantalla de gestión de cuentas que todavía no está construida.

## Validación ejecutada

- Tres suites locales relevantes: 122 casos verdes en 11,70 s; use cases de gestión, modelo de importación y matriz de elegibilidad reales. El cuarto path solicitado inicialmente no existía y no se le atribuye cobertura ni ejecución.
- Check-manual: tema de admisiones (25 capturas), Formas de ingreso (3 capturas) e índice detallado sin errores; dos advertencias conocidas cada uno por documento local sin URL publicada y falta de catálogo central de traducciones.
- 184 enlaces locales/anclas comprobados, cero errores.
- Veinticuatro renders Chromium/WebKit a 1280/390 px, cero desbordes/errores; ambas colecciones de capturas permanecen idénticas al HEAD de partida. No se generaron capturas de matching, excepción o corrección ausentes.
- Navegación nueva por Vinculación/Formas de ingreso/índice, reload con ancla y regreso al menú por teclado: cuatro combinaciones Chromium/WebKit 1280/390 verdes, cero desbordes y errores.
- Source-trace comparado antes de editar: admisiones desde 8ed4c7ad sin cambios de código posteriores; Formas de ingreso desde 4fb2fd8e con los deltas reales de lista/CSV y sus owners revisados. Las metas se registran contra el commit comprobado del código sin retirar scopes anteriores.
- Review del delta documental: cero hallazgos, seis archivos estables, hash `448B83B03AC03B5D80D241DBFD7F9C18A1AC5465640A33E553A6C48902BBF4F2`. La observación de QA pendiente del reviewer se concilia con su resultado posterior verde.

La comprobación adicional de navegación detectó dos problemas del arnés y un fallo real. Se agrega espera de URL/carga y estabilidad de fuentes antes de evaluar un documento recién navegado; se comprueba el viewport configurado por el browser en vez de una propiedad transitoria ausente. WebKit seguía emitiendo `ResizeObserver loop completed with undelivered notifications`; la causa era `refit` modificando el tamaño del frame observado en el callback. El runtime local de capturas ahora agrupa el ajuste con setTimeout fuera de la entrega del observer. El script canónico Heritage permanece idéntico y no se silencian errores. La navegación final completa pasó con cero errores después de ese fix; se repite el render global y se revisa ese delta antes del cierre.

Source-trace final: cuatro guías registran `40391d16e38f2ef16f8680f38aeb1017f17e6b63`, con 44/24/53/53 scopes existentes y anteriores conservados. Review del refit/trazabilidad: cero hallazgos, cuatro archivos estables, hash `94A8D528F27E8E456A3B589320BB6D538815BBD647E0A9D949C2E528557994B1`. Su observación de QA pendiente se concilia con el resultado terminal posterior: veinticuatro renders verdes después del fix, sin errores.

No cambia código runtime, esquema del servidor o configuración desplegada. No requiere migración o un test artificial de strings de fuente. El CI del código documentado permanece como evidencia T118; no se vuelve a ejecutar un build para una edición de prosa/contrato. T111/T112/T113/T120 y el runtime de toda la feature conservan sus alcances completos pendientes.
