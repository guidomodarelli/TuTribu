# Auditoría de cierre de T107

Se aplica functionality-check al criterio completo de T107, sin reducirlo a SC-021. El dominio, configuración/importación y datos de entrada conservan sus pruebas/evidencia de commits anteriores; la admisión común vuelve a ejercerse en SQL sobre el writer ampliado de `70eef0a0`. La muestra persistida original termina antes de esta auditoría. No se cierran T111, T112, T113 o T120 por dependencia implícita.

| Criterio obligatorio | Evidencia autoritativa |
| --- | --- |
| US-03-AC-01: coincidencia válida admite y traza habilitación | `allowlist-admission-persistence.test.ts`, verde original 76,26 s y regresión actual 81,92 s; decision system/automatic con entry/version, binding/member/approved notice en un commit, entrada intacta. ON email/phone dos nativos verdes 286,21 s. |
| US-03-AC-02: reenviado/otra identidad no autoriza | `allowlist-admission.test.ts` niega contacto ajeno y otro owner; SQL negativo `allowlist-admission-denials.test.ts` sin coincidencia/declarado/disabled/forwarded, cero request/member. Carrera T109 conserva proof del perdedor sin miembro/binding ajeno. |
| US-03-AC-03: excepción explícita sin editar lista | `allowlist-exception-review.test.ts`, dos SQL finales verdes 243,38 s; motivo requerido, pending y aprobación explícita, entry/version/estado independientes. OFF declarado no fija binding. |
| US-03-AC-04: excepciones OFF cierra falta de coincidencia | Modelo local y SQL negativo sin excepción, original denial completed; no request/binding/member. |
| US-03-AC-05: fila posterior no aprueba pending | Primer caso real de `allowlist-exception-review.test.ts`; añadir entrada después mantiene pending hasta decide explícito y conserva entry/version. |
| Binding único sólo al presentar | Dominio de contacto/configuración no produce owner; import/CRUD native cero bindings; prueba aislada emite proof sin binding. T109 carrera dos cuentas y muestra mil bindings sólo junto a presentación. |
| Alias y países exactos | `admission-contact.test.ts` y `allowlist-entry.test.ts` preservan puntos/etiquetas, rechazan país ambiguo/country contrario y usan libphonenumber real para E.164. Native ON phone y aislamiento/owner de T109 complementan el dominio. |
| Mil contactos exactamente 800/200 | `allowlist-admission-sample.test.ts`, único handle original, exit 0/14.164,02 s: mil comandos reales con todos los asserts SQL y cleanup; `allowlist-persisted-sample-baseline.md`. |
| Crear entrada versión uno | Modelo real y SQL `allowlist-persistence.test.ts`, original creation/version 1. |
| Nombre/estado efectivos incrementan una vez | Entidad y SQL config con rename/disable, versión dos y posterior tres, auditorías sin duplicados. |
| No-op vigente conserva versión | Entidad y SQL update de estado coincidente con expectedVersion actual retorna changed false/version dos. |
| Versión antigua produce conflicto aunque coincida | Entidad y SQL owner completo mantienen rechazo original; boundary HTTP mapea 409 y no pisa ganador de CAS. |
| Reenlace conserva versión de entrada | `allowlist-binding-reuse.test.ts`, SQL verde 132,30 s; primer binding/id/fecha/source conservados tras cancelación/retry autorizado, entry enabled/version uno. |
| Reimport/excepción no editan fila | SQL mixed/import de T115/T118 y excepción: duplicados unchanged/conflict, disabled no se reactiva ni borra, binding separado. Auditoría T108/T110 preserva resultados por fila realmente confirmados. |

Ronda local actual de cuatro suites relacionadas: 40 casos verdes en 2,41 s. Las pruebas se basan en comportamiento/contratos y SQL reales, nunca strings de fuente. Los nativos gated de CI no sustituyen la evidencia terminal descrita. La evidencia previa sigue aplicable donde owners no cambiaron; el writer común ampliado tiene regresión nativa y CI4.488 verdes del checkpoint de preview.

La revisión independiente confirmó las catorce cláusulas sin gap obligatorio. Se marca T107, pasando a 107 completadas/105 pendientes de 212. Un P3 del registro de muestra se corrigió identificando los hitos previos como históricos; este delta de docs/casilla se revalida antes de guardar. T111 todavía conserva minimización/retención, T113 matriz completa personal/common y T120 confirmación máxima de importación/otros AC finales. No se acredita rollout, purga ni provider real.
