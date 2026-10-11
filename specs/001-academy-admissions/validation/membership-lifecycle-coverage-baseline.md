# Cobertura de membresías y puentes históricos: evaluación en curso

T153–T156 conservan sus criterios originales. El cierre del writer histórico después de activar protección es una guarda necesaria; por sí solo no acredita que la invitación impersonal continúe por la política común ni que la UI antigua esté integrada. Esta evaluación parte del código `0bd9eb48` y no marca tareas.

## Contraste inicial

| Comportamiento requerido | Evidencia existente | Estado antes de terminar la validación actual |
| --- | --- | --- |
| Active/muted conservan rol, fecha y estado al abrir enlace o activar | Política `evaluateAcademyMembershipEligibility`, writer aprobado y casos SQL de legacy/cutover/reconciliación. | Implementación existente; revalidación actual en curso. |
| Conducta/remoción administrativa dominan pago o aprobación | Política pura, writer bajo locks y reconciliaciones de producto membership; roles privilegiados/NULL permanecen cerrados. | Implementación existente; revalidación actual en curso. |
| Restricción comercial recuperable conserva snapshot activo/silenciado y sólo acceso básico | Writer de pertenencia, snapshot nullable y fuente básica/paga consumida; no restaura grants ni cursos. | Implementación existente; revalidación actual en curso. |
| Fundamento básico legítimo sobrevive suscripción antigua inactiva | Reconciliación de precio/diagnóstico y consumo de procedencia, con fuentes actuales/históricas separadas. | Casos SQL existentes; revalidación actual en curso. |
| Otra membresía legítima cancela pendiente sin fingir aprobación | Owner de resolución externa compone la transacción paga, evento y aviso; rollback y plazo vencido tienen casos existentes. | Implementación existente; revalidación actual en curso. |
| Histórico impersonal como common, UI joinAcademy y checkout directo | Endpoint explícito academy/join delega al owner actual; acción de invitación antigua llama a su repositorio histórico y bloquea altas tras el marcador. No se ha acreditado desde esa acción el recorrido positivo completo como common. | Parcial/no verificado: contrastar e implementar T155/T157/T158; no sustituir ese criterio por el cierre negativo. |
| Rollback/flag/policy ausente no reabre alta gratuita | Marcador monotónico y guardas SQL/runtime, con tests reales de cutover e invitaciones. | Casos existentes; revalidación actual en curso. |
| Salida/reingreso, mode exit/delete/moderación y cancelación atómica por owners reales | Procedencia y archivo SQL tienen pruebas; composición completa de los owners conserva T156/T159/T160. | No dar por completo sin seguir las rutas reales y sus efectos. |

## Ejecución actual

`.git/codex-t153-t155-current-membership-lifecycle.json` termina exit 0 con 69 casos verdes/cero omitidos en cinco suites: once de dominio y 58 SQL (26 reconciliación, ocho cutover, trece writer y once legacy). Usa PostgreSQL real en ramas propias, transporte/puertos de pago controlados, maxWorkers=1 y sin paralelismo de archivos. Cleanup anterior al terminal. Duraciones por suite SQL: 770707,3313 / 213177,9424 / 302192,9109 / 251371,1243 ms. Las filas de contraste conservan su alcance: estos resultados no acreditan el puente positivo legacy que todavía falta.

La evaluación descubre una brecha concreta de T154: la suite anterior comparaba membresía y procedencia, pero no bonificaciones/matrícula ni el acceso observable a cursos existentes. Se agregan seis casos por producto y entrypoint en `admission-membership-sources.test.ts`, con `PostgresProductAccessRepository` y `PostgresCourseRepository` reales. Dos helpers del escenario original se extraen a una fixture compartida, con configuración en constants, sin cambiar producto ni abrir el writer antiguo. Tipos de tests y lint pasan; el focal termina verde en 34360,4176 ms con cinco variantes filtradas. El lote completo posterior termina exit 0 con 32 aprobados/cero omitidos: seis nuevos y 26 de regresión tras extracción. La auditoría íntegra está en [subscription-membership-validation-completion-audit.md](subscription-membership-validation-completion-audit.md); no se suman casos solapados con el reporte previo de 69 o el focal.

Los baselines `membership-writer-baseline.md`, `membership-source-baseline.md`, `subscription-membership-baseline.md` y `legacy-entrypoints-baseline.md` conservan sus pruebas anteriores y límites. El origen de T153 menciona seis AC y RG-01–04 aunque su lista de trazabilidad termine en RG-03: se preserva también el criterio RG-04, sin reducir la tarea ni modificar los documentos normativos.

No se agregan tests duplicados que sólo reflejen un fake ni se infiere persistencia desde contratos. Los resultados finales decidirán qué evidencia puede reutilizarse y qué escenarios o integración faltan. No se modifican fuentes importadas por la ejecución activa.

## Roles privilegiados e historia desconocida

T153 recibe nueve casos adicionales en `tests/unit/modules/tribes/application/academy-membership-lifecycle.test.ts`: leader y guardian con historia comercial conocida, y tribemate con snapshot NULL, a través de precio, diagnóstico y webhook. Se crean filas reales, se activa la protección con un único instante nativo y se compara identidad, rol, estado, fecha, snapshot y procedencia antes/después del pago legítimo; no se inventa aprobación o fuente consumida. Las constantes pertenecen a `tests/support/constants/academy-membership-lifecycle.ts`.

Tipos de tests y lint focales terminan correctamente. El lote `.git/codex-t153-privileged-and-unknown-history-native.json` termina con seis aprobados y tres fallos de base de datos al preparar los escenarios de leader. No se acredita el comportamiento de pago para esos tres casos ni se modifica producción/assertions antes del diagnóstico PostgreSQL. Las variantes de guardian y snapshot NULL pasan por las tres entradas. Corrió junto al lote T154 con una rama por job y sin fixtures anidadas; máximo dos ramas propias simultáneas y cleanup antes de su terminal. El cierre de T153 conserva sus seis AC completos, incluido el puente histórico positivo que falta implementar.

T154 se cierra por su auditoría independiente y 32 casos actuales completos, sin sumar los seis aprobados o los fallos de este otro lote. El inventario queda en 152 completadas/60 pendientes; T153 y T155 siguen abiertas.
