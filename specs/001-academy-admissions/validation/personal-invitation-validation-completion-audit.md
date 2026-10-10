# Auditoría del criterio completo de T132

Contraste sobre `990002e6`, con T131 cerrada. Se verifica el criterio previsto de SQL/UI reales, siete AC nominativas/manual/lista, cien confirmaciones y fallos/commit perdido. La entrega externa ON conserva su ensayo operativo y no se sustituye por transporte controlado.

| AC | Evidencia real contrastada |
| --- | --- |
| US-04-AC-01 | Canje automático con dispensa, destinatario exacto y proof local ON email/phone; SQL de admisión y matriz personal. |
| US-04-AC-02 | Canje manual crea pending, no membership; revisión posterior explícita conserva autorización y evidencia originales. |
| US-04-AC-03 | Lista requerida ausente/deshabilitada deniega sin canje o excepción; habilitarla conserva el original denegado y exige otra confirmación. |
| US-04-AC-04 | Preview anónimo/tercero y cuenta incorrecta permanecen genéricos, sin destinatario o consumo; HTTP y páginas reales. |
| US-04-AC-05 | OFF insuficiente no inicia OTP; inicio/cambio de cuenta y vía común son acciones separadas sin canje oculto. |
| US-04-AC-06 | Revocación de autorización pending cancela esa solicitud, conserva redeemed y no expulsa admitted; rollback, carrera y CAS actuales. |
| US-04-AC-07 | El reloj PostgreSQL acredita expiry real del enlace después del canje y aprobación posterior con plazo propio del request. |

`personal-invitation-atomicity-baseline.md` conserva los trece escenarios SQL y sus fallos previos: cien UUIDs distintos terminan con cero fallos, 13 completed/87 started y exactamente un canje, request, binding, decisión, membership, fundamento y aviso. El replay ganador no duplica efectos. Rollback, retiro concurrente, respuesta/commit perdido, rechazo/cancelación/expiry y negativa a reciclar token tienen sus pruebas específicas y cleanup real.

Las Native personales previas acreditan canje ON local y OFF/cuenta/retorno; los ocho recorridos administrativos actuales acreditan emisión/rename/reemisión/recuperación/revoke en Chromium/WebKit a 1280/390. Cada snapshot conserva su alcance y no se atribuye un resultado antiguo a una rama o delta no ejecutados. Los cambios posteriores del paso compartido se contrastan con source actual, contratos vigentes y audits de T113/T127/T124–T131.

La revisión Codex de 27 archivos confirma cero brechas obligatorias, manifest estable `E555238ECE6C9572A99008FD8DE3E2B558729C2E01061266548117A2D742CF2B`; no identifica un hueco que justifique repetir las matrices grandes. No ejecuta pruebas ni se usa su dictamen como un resultado Native.

Se marca sólo T132: 136 completadas y 76 pendientes, 212 IDs/requisitos intactos. La entrega externa ON de T106, SC-014/T207, proveedor real, resolución legacy, activación y gates mantienen su trabajo propio. El cierre no afirma el objetivo global ni el resultado de la importación máxima todavía activa.
