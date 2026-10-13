# Auditoría del criterio completo de T138

Contraste backend sobre `7cc9355c`, con T137 y T135 cerradas. La revisión de sólo lectura acredita todo el criterio de T138; no inventa una pantalla general de transferencia ni atribuye aprobación a toda US7.

| Requisito | Evidencia alcanzable |
| --- | --- |
| Toda mutación canónica del líder | Guarda SQL sobre INSERT/UPDATE/DELETE y cambios de rol/status en tribe_members: suspensión atómica, fence de tribu y rollback. SQL61839 valida las variantes estructurales. |
| Owner tribes y transferencia explícita | Use case y repositorio reciben cuenta/sesión actuales y miembros existentes, conservan UUID/CAS y verifican el efecto estructural antes de devolver resultado. Native owner87031 conserva procedencia y slots suspendidos. |
| Autoridad antes de secretos | Native acceso9846 y fence53410 rechazan al líder anterior y al nuevo sin configuración propia; después de la espera real, el reader cierra sin consultar keyrings. No se entrega la credencial anterior al nuevo líder. |
| Autoridad antes del despacho | Pipeline99047 verifica escenarios antes y después del marker: cero requests y lecturas de secreto después del cambio, sin redirigir el trabajo ni liberar la reserva consumida. |
| Nueva conexión probada del nuevo líder | La selección anterior suspendida no constituye autorización; el nuevo líder debe aportar y probar su conexión por los use cases de preparación/activación existentes. |
| Nominativas, membresías y consumo preservados | SQL de guarda/owner compara identidad, estado y fechas de membresías, invitaciones y procedencia. Suspender envíos no borra esos recursos ni reinicia consumo. |

La migración efectiva es `20261008200000_guard_messaging_leadership_changes.sql`, integrada en el journal vigente como idx132. El path propuesto originalmente en la tarea se mantiene como trazabilidad del plan; esta diferencia de nombre no reemplaza ni reduce el criterio. El recorrido real y sus fallos históricos permanecen en `messaging-leadership-guard-baseline.md`.

Validación local actual: `transfer-tribe-leadership.test.ts` termina exit 0 con 13 verdes/cero fallos/cero omitidos (`.git/codex-t138-local-transfer-contracts.json`). Revisión Codex de 23 archivos: cero accionables y SHA256 inicial/final `ECEC6FBA5F63A7A4806AF12D974639AF09B1A22081DD13573B97E3F6D8123D5E`. El reviewer no ejecuta esas pruebas ni se usa su dictamen como resultado de ejecución.

Se marca sólo T138; T139–T143, la interfaz general, los gates y los dos Native activos conservan su alcance. El conteo pasa a 130 completadas y 82 pendientes, con los 212 IDs y criterios originales intactos.
