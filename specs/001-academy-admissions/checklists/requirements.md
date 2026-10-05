# Specification Quality Checklist: Admisiones a academias y mensajería por tribu

**Purpose**: Validar integridad, claridad y preparación de la especificación antes de planificar la primera implementación.

**Created**: 2026-10-05

**Feature**: [spec.md](../spec.md)

**Review Ownership**: Checklist documental mantenida por `$speckit-specify` y `$speckit-clarify`. La [checklist temática](admission-review.md) conserva su revisión independiente y sus pendientes.

**Marker Semantics**: `[x]` acredita revisión de calidad de los requisitos. No acredita implementación, pruebas de producto ni preparación operativa de un canal externo.

## Calidad del contenido

- [x] CHK001 No se introdujeron detalles de implementación ajenos al contrato obligatorio de entrada; las 27 restricciones TC se conservan en [technical-contract.md](../technical-contract.md).
- [x] CHK002 La especificación describe valor y necesidades de solicitantes, líderes, guardianes e integrantes, con admisión básica separada de derechos comerciales.
- [x] CHK003 Los recorridos y resultados se expresan para responsables del producto; los términos técnicos exigidos por el usuario conservan su contexto y autoridad.
- [x] CHK004 Están completas las secciones obligatorias de la plantilla activa: escenarios, requisitos, entidades pertinentes, criterios de éxito y supuestos, en su orden original.

## Integridad de los requisitos

- [x] CHK005 La especificación activa no contiene marcadores `NEEDS CLARIFICATION` ni placeholders pendientes.
- [x] CHK006 FR-001 a FR-142 definen obligaciones verificables; se conservan las matrices, permisos, estados, límites y decisiones sin reinterpretar su alcance.
- [x] CHK007 SC-001 a SC-021 expresan resultados medibles y condiciones de evaluación, diferenciados de resultados ya observados.
- [x] CHK008 Los resultados no incorporan herramientas nuevas de implementación; Zavu y la sustitución de transporte de SC-020 se mantienen como restricciones expresas del contrato.
- [x] CHK009 Las 12 historias contienen sus 71 escenarios identificados, con precondición, acción y resultado esperado.
- [x] CHK010 EC-01 a EC-45 describen casos límite y resultados obligatorios, incluidos concurrencia, identidad, consumo y recuperación.
- [x] CHK011 El alcance y sus exclusiones delimitan una primera implementación única, con Zavu como único proveedor de esta entrega.
- [x] CHK012 Están identificadas dependencias y supuestos: identidad global existente, evidencia base suficiente, recursos del líder, canales preparados, autorización de ensayos y compatibilidad con TuTribu.

## Preparación de la feature

- [x] CHK013 Cada FR conserva su contrato observable y su fila en [traceability.md](../traceability.md), relacionada con historias, resultados y focos de validación.
- [x] CHK014 Los escenarios cubren los recorridos principales: políticas, lista, importación, excepciones, invitaciones, contacto, conexiones, revisión, avisos, privacidad y compatibilidad.
- [x] CHK015 Los resultados de éxito son coherentes con los requisitos y el alcance completo; su cumplimiento se verificará durante la implementación, sin certificarlo en esta revisión documental.
- [x] CHK016 La especificación conserva las fronteras exigidas sin elegir servicios, colas, esquema, librerías o mecanismos criptográficos adicionales ni generar artefactos de planificación o código.

## Evidencia de integridad

| Elemento | Contrato de entrada | Feature activa |
| --- | --- | --- |
| Historias | US-01 a US-12 | 12, sin renumeración |
| Escenarios de aceptación | US-01-AC-01 a US-12-AC-04, según cada historia | 71, sin omisiones |
| Decisiones cerradas | D-01 a D-24 | 24, conservadas |
| Requisitos funcionales | FR-001 a FR-142 | 142, conservados |
| Casos límite | EC-01 a EC-45 | 45, conservados |
| Criterios de éxito | SC-001 a SC-021 | 21, conservados |
| Restricciones de planificación | TC-001 a TC-027 | 27, conservadas en documento separado |

La revisión comprueba igualdad del contenido normativo desde `## Propósito y alcance`, normalizando únicamente finales de línea. La cabecera se adapta a la carpeta efectiva y a la rama existente. No se cambia ningún identificador ni se necesita una tabla de equivalencias.

Los documentos `technical-contract.md`, `traceability.md`, `handoff.md` y la checklist temática se conservan desde el paquete original. `spec-inputs/academy-admissions/` permanece como snapshot; la fuente activa para los próximos pasos es `specs/001-academy-admissions/`.

## Notes

- El usuario pidió conservar íntegramente el contrato funcional y las restricciones técnicas. Por eso FR-135 a FR-137 y SC-020 mantienen las obligaciones de extensibilidad y composición. CHK001, CHK003, CHK008 y CHK016 evalúan que no se agreguen elecciones técnicas ajenas a ese contrato; no eliminan restricciones aportadas para cumplir una regla genérica de estilo.
- El login global es obligatorio. El check de contacto es opcional por tribu y no concede identidad global. Se preserva la incompatibilidad de lista telefónica automática con OFF y el recorrido manual sin mensajería.
- Solo Zavu está previsto para producción en esta entrega. Una credencial válida no acredita un canal probado; un mensaje aceptado o entregado no acredita un código comprobado. Los ensayos reales y la preparación de recursos siguen pendientes de sus autorizaciones y capacidades efectivas.
- La constitución 1.0.0, [AGENTS.md](../../../AGENTS.md), la [plantilla activa](../../../.specify/templates/spec-template.md) y las guías de [multi-tenancy](../../../docs/architecture/multi-tenancy.htm), [roles](../../../docs/architecture/roles-and-permissions.htm) y [RLS](../../../docs/architecture/rls-simple.htm) se consultaron como reglas vigentes. No se modifica ninguna de esas fuentes.
- No se detectaron contradicciones documentales que requieran reabrir decisiones cerradas. El inventario de vías gratuitas, la evidencia de identidad disponible, el rol efectivo de base, la retención y los contratos vigentes de Zavu deben comprobarse en la planificación; esta revisión no sustituye esa investigación.
- La integración MCP `memory` no está disponible en esta sesión (`unknown MCP server 'memory'`). El contexto usado proviene de las reglas y archivos versionados.
- La plantilla principal y la numeración secuencial se resolvieron mediante la instalación local de Spec Kit. `.specify/feature.json` registra la carpeta efectiva, independiente de la rama Git. No hay hooks de extensiones registrados en `.specify/extensions.yml` para esta ejecución.
- La etapa `$speckit-specify` generó únicamente especificación y sus referencias/checklists. La planificación posterior vive en [plan.md](../plan.md) y sus artefactos de diseño; no cambia este resultado de revisión del contrato. No se implementó schema/código, ejecutaron migraciones, configuraron cuentas ni enviaron mensajes. Las métricas de éxito siguen siendo objetivos, no mediciones de implementación.

## Resultado de revisión

Revisión documental completada: 16 de 16 criterios satisfechos dentro del alcance y las restricciones expresas del usuario. La feature está preparada para `$speckit-plan`; la checklist temática permanece pendiente de su revisión propia.

Se verificaron el cuerpo normativo íntegro, los identificadores originales, 142 filas de trazabilidad, 27 restricciones TC, las cuatro referencias copiadas, 15 enlaces relativos y la selección de carpeta mediante `check-prerequisites.ps1 -PathsOnly -Json`. `pnpm run lint` y `pnpm run typecheck` pasaron. Estas verificaciones no son pruebas funcionales de la feature ni ensayos de Zavu.
