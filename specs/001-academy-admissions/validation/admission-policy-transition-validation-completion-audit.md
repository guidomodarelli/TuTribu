# Auditoría de cierre de T144

Alcance original: seis AC de US9 y las once filas de revisión, con épocas, retirada/compromiso, contacto ausente/fijo y ausencia de aprobación implícita por lista o configuración permisiva. Se usan las pruebas reales existentes por responsabilidad, aunque sus paths difieren del archivo application previsto. El código de producto conserva sus owners de dominio, policy, request/proof, mensajería y membresía.

| Criterio | Evidencia específica y límite |
| --- | --- |
| Cien canjes, efecto único y recuperación | T132: personal-invitation-atomicity, cien resultados sin fallos (13 completed/87 started), un único efecto y UUIDs originales. No se interpreta started como efecto terminado. |
| Decisiones opuestas indivisibles | Native13634, cien comandos reales/pool propio100, una terminal/decisión, effects y replay coherentes; 448,55 s. El oráculo estricto rechaza causas técnicas; el verde previo defectuoso no acredita esa propiedad. |
| OFF→ON y prueba nueva en la misma pending | Native83989, policy writer/época2→issue/verify/apply→approve/replay, request/contacto/fechas conservados, 225,27 s. |
| Política más permisiva sin autoaprobar | Native35214, writers reales ON/OFF y misma pending sin decisión/membresía/aviso duplicado, 125,31 s. |
| Prueba aplicada histórica válida | Native11495, snapshot coherente de tres días cargado antes de instalar m915, guardas activas al decidir, 44,04 s. Acredita lectura/decisión actuales, no OTP histórico ni restore. |
| Pausa/vencimiento tras espera real | Native80151, waiter comprobado y reloj SQL después del bloqueo, negativas sin efectos; 54,06/49,05 s. |
| Común/manual OFF y ON | Writers manuales, prueba nueva y aplicada histórica hasta decisión; baseline de dominio y lectura actual. |
| Común/lista: coincidencia o excepción | Native86224: cuatro email/phone × entrada presente/ausente, proof aplicada, motivo requerido y decisión humana, cero omitidos. [Últimas celdas](admission-review-matrix-final-cells-baseline.md). |
| Nominativa con lista requerida | Native6361: redeemed/bound inicialmente aprobable, entrada deshabilitada y razón allowlist_requirement_unmet, approve denegado aun con excepciones ON, 121,56 s. |
| Nominativa que dispensa lista | T132 y personal-invitation-manual-persistence: autorización/destinatario originales y revisión explícita, sin convertir la fuente en común. |
| Cada OFF→ON crea época distinta | Tres reactivaciones locales épocas2/3/4 y Native de cambio/aplicación de la nueva prueba. |
| ON→OFF: aplicada válida y revocada | SQL de policy conserva aplicada/request/plazo e invalida sólo disponible; Native97180 y regresiones ON/OFF mantienen evidence_revoked y recomprobación. |
| Canal/remitente/rotación normal | Propuestas sin época nueva y swap SQL91790 conservan aplicada/request y retiran sólo evidencia sin aplicar; evidencia de T137. |
| Compromiso | messaging-connection-compromise y T137 revocan available/applied de pendientes según causa, conservando miembros e invitaciones; la proyección corregida mantiene needsVerification. |
| Contacto ausente/fijo | admission-proof-application: primera adjunción auditada y sustitución rechazada; Native SMS/WhatsApp conserva contacto y fechas. |
| Requisito ausente y pausa | Pending/razones actuales sin aprobación implícita; consulta, rechazo y cancelación siguen disponibles y no renuevan plazos. |

FR027–028, FR050–052, FR098–108, FR127, EC07/08/13/17/18/29/39, D09/D12, SC001 y TC011/024 quedan vinculados a esos contratos y pruebas. El inventario distingue los seis AC de la matriz; no suma suites solapadas ni resultados filtrados como cobertura nueva. El fixture normal también pasó Native3132 (90,38 s), sin usar el snapshot histórico.

Revisión Codex integral: cero hallazgos accionables, manifiesto estable de 51 archivos `40F0BA2CD7E13CC10C60655D8FE8EA8C69005DCB586E4ADD899CB841DFA447D4`. El único resultado entonces pendiente, personal6361, terminó verde con source idéntico al revisado. Revisión final documental y de marcadores: cero hallazgos, manifiesto estable de cuatro archivos `5C90A67A8DBCD4AEAE2410E40794CF395A26E6A81941059B2977668289DC3382`, previo a añadir este registro; 212 IDs únicos y únicamente T144 añadida al cierre. Tipos de tests y lint pasan. Sólo cambian tests/evidencia; no se atribuye un nuevo build o cambio de producto a este cierre.

El cierre es únicamente de T144. T145 conserva sus otras carreras; T147 conserva su auditoría propia; T120 requiere resultado completo de reimportación. Piloto real, SC014/humanos, legacy, hosting/restore/rollout y gates externos mantienen su alcance pendiente. Al marcar T144 el inventario pasa a 137 completadas y 75 pendientes de 212.
