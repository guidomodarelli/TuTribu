# Auditoría de cierre de T120

Se contrasta el alcance original de T120 con los seis criterios de US-03, los casos extremos relacionados y SC-016/SC-021. La revisión independiente sobre `0a345dc6` conserva 29 de 29 fuentes estables, manifiesto SHA256 `B9750AD3FFA9FB0A770F53F450BB7D2545251C1BA16BD82F3CA80B958C9DE5B1`, y no identifica brechas obligatorias. No se reduce el alcance a preview ni a una muestra pequeña.

| Criterio | Evidencia observable |
| --- | --- |
| US-03-AC-01: coincidencia válida | Admisión automática con decision system/automatic, entry/version trazados y binding, miembro y obligación atómicos. SQL base y recorridos ON email/phone reales conservan la entrada. |
| US-03-AC-02: identidad ajena, declarada o reenviada | Los casos negativos persistidos no conceden solicitud ni acceso; la carrera de dos cuentas conserva la identidad y niega apropiación ajena. |
| US-03-AC-03: excepción explícita | OFF/ON email/phone crean pending separada y requieren revisión con motivo; no editan la lista ni aprueban por coincidencia posterior. |
| US-03-AC-04: excepciones deshabilitadas | La falta de coincidencia termina sin request, binding o miembro. |
| US-03-AC-05: incorporación posterior | Añadir una entrada no aprueba automáticamente la solicitud pendiente; la decisión explícita conserva versión/estado de la entrada. |
| US-03-AC-06: importación parcial y conflictos | Preview, mixed outcomes, rollback, reanudación y replay persistidos preservan filas ya confirmadas y entradas deshabilitadas. |
| EC-02, EC-04, EC-16, EC-17 y EC-41 | Evidencia insuficiente, alias exactos, entrada deshabilitada sin expulsar al miembro, edición posterior y nombres con HTML/fórmulas cuentan con comportamiento observable en las suites y baselines vinculados. |
| SC-016: capacidad y reimportación | La corrida máxima original confirma 10.000 añadidas. Tras deshabilitar una entrada mediante su writer real, la reimportación produce 0 añadidas, 9.999 unchanged, 1 conflict y 0 skipped. PostgreSQL conserva 10.001 entradas, la deshabilitada en version2 y la independiente habilitada en version1/nombre original; 0 bindings y 0 miembros. |
| SC-021: muestra exacta | Mil comandos reales producen 800 admitted, 200 pending y 0 failures. SQL confirma 800 approved/200 pending, 800 miembros básicos activos, mil bindings, 800 entradas enabled/version1, 800 decisiones automáticas trazadas y obligaciones 800 approved/200 pending_created. |

La confirmación máxima termina exit 0 con un caso verde/cero omitidos en 25.759,46 s, reporte privado `.git/codex-t120-maximum-import-native-first.json`. La fuente mantiene SHA256 `134BC6437640C0082B75F2226C3A17B0DF80B0836E13DFF8F4C446559C9359AF`. Se conserva la operación, selección y expectedVersion originales durante recuperaciones explícitas de recencia y lease, sin reiniciar ni reducir volumen, esperas u oráculos. La muestra SC-021 original termina exit 0, un caso verde en 14.164,02 s; sus agregados finales tienen comprobación SQL independiente del resultado de aplicación.

La revisión comprueba que la rama máxima propia tenía `default=false`, pertenecía al proyecto/parent autorizados y fue eliminada; su ausencia devuelve 404. Los otros baselines documentan el cierre de pools y eliminación de sus ramas efímeras. Las observaciones parciales y diferencias anteriores permanecen como historia y no se presentan como resultados terminales. No se consultan ni publican contactos, secretos, sesiones o filas privadas.

Las suites específicas se distribuyen entre `allowlist-admission-persistence.test.ts`, `allowlist-admission-denials.test.ts`, `allowlist-exception-review.test.ts`, `allowlist-local-proof-exception-review.test.ts`, `allowlist-import-persistence.test.ts`, `allowlist-import-maximum-confirmation.test.ts` y `allowlist-admission-sample.test.ts`, en lugar del único archivo de persistencia propuesto inicialmente. Validan contratos y efectos reales, sin pruebas de strings internos ni mocks de plataforma.

Evidencia complementaria: [cobertura de lista](allowlist-admission-coverage-audit.md), [persistencia e importación](allowlist-import-persistence-baseline.md), [confirmación máxima](allowlist-maximum-confirmation-baseline.md), [muestra persistida](allowlist-persisted-sample-baseline.md), [binding y unicidad](allowlist-binding-completion-audit.md) y [documentación de lista](allowlist-documentation-baseline.md).

Se cierra únicamente T120. El inventario pasa a 142 completadas y 70 pendientes de 212. Los recorridos T146/T150 y gates de proveedor externo, ensayo humano, restore, despliegue y rollout conservan sus propios alcances pendientes.
