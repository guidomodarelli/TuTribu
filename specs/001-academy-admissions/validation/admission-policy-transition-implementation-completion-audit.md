# Auditoría de cierre de T147

Alcance original: transición atómica de policy/época/invalidaciones, fences comunes con submit/decision, ON→OFF sin perder aplicada válida o revivir revocada, conservación tras swap normal y recomprobación por compromiso con causa segura. T144 está completa; esta auditoría sólo acredita la implementación backend de T147, sin atribuir las carreras restantes de T145 ni nuevos recorridos externos.

| Cláusula | Owner y evidencia |
| --- | --- |
| Policy, época, invalidaciones y audit atómicos | PostgresAdmissionPolicyRepository guarda, invalida y audita en una transacción del ledger. SQL93573 acredita rollback; Native83989 completa época nueva, prueba aplicada y decisión explícita. |
| Mismos locks que submit/decision | Los authorizers de policy/request toman primero el fence de tribu. Native72507 prueba las carreras epoch/connection, dos verdes en 329,93 s; se conserva el reloj SQL después de waits. |
| ON→OFF conserva aplicada válida | invalidateUnappliedEvidence sólo afecta available. SQL78971 conserva aplicada, pending y fechas originales. |
| No revive evidencia revocada | El dominio rechaza invalid; Native97180 y regresiones ON/OFF conservan evidence_revoked y needsVerification con la comprobación apagada. |
| Reemplazo normal conserva histórica | Las dependencias de selección retiran sólo evidencia disponible y conservan flags/época. SQL91790 mantiene aplicada/request/reservas; la revisión histórica actual sigue disponible. |
| Compromiso y causa segura | Las dependencias de lifecycle revocan available y applied de pendientes según causa, conservan miembros/invitaciones y las consultas muestran recomprobación. SQL18929/57084/12692 acreditan efectos/rollback/preservación; needsVerification es derivado, sin nuevos estados de membresía. |

Los use cases de administración de policy están conectados con sus writers reales y los owners de mensajería; no se deduce implementación de interfaces aisladas ni se exige el archivo domain previsto si sus reglas ya pertenecen a los owners existentes. T144 conserva su matriz completa por scope. La evidencia previa de SQL y los Native nuevos se contrastan con las fuentes actuales; los filtrados y snapshots no se convierten en coverage adicional ni OTP histórico.

Revisión Codex integral: T147 completo en su alcance backend, cero hallazgos accionables, manifiesto estable de 36 archivos `2DA93C4B2BEB3026151D7F76D019C419C25175CC232024F10485FF62DAC34180`. La revisión final de cierre documental y marcadores también termina con cero hallazgos, manifiesto de tres archivos `C5E857F4AFF0F11DB74FD37CA3792905805F8D4036BA5C22B44A500876F1BB3B`, previo a añadir este registro; 212 IDs únicos, sólo T147 añadida al cierre. El reviewer no editó ni ejecutó nuevas pruebas. El cambio de este cierre sólo agrega evidencia y marcadores; los comportamientos ya implementados conservan sus validaciones propias y su documentación vigente.

Se cierra únicamente T147. T145 conserva la carrera de cuenta en ejecución y su auditoría completa; T148/T149 y los restantes flujos/gates mantienen su alcance original. No se acreditan hosting, restore, entrega externa o rollout. Al marcar T147 el inventario pasa a 138 completadas y 74 pendientes de 212.
