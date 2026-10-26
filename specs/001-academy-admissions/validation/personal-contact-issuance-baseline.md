# Código de contacto personal — emisión y reenvío

Incremento sobre `7e063f43`, sin cerrar tareas US4/US5 ni gates productivos. Integra source personal en el owner actual de código, preservando common y diagnóstico. UI/página personal, matrix completa por canal y delivery real aún pendientes.

Issue deriva email desde cuenta y teléfono desde input normalizado; policy ON/version/canal actual, token HMAC contextual, contacto exacto/lista y binding se comprueban dentro del flujo nativo. El código conserva sólo referencia inmutable de invitación y pending original cuando existe. La migración versionada `20261009180000_bind_personal_verification_challenges.sql` agrega FKs de tenant/cuenta/invitación exactas y guard de origen. No guarda token ni backfill. Pedir o comprobar crea sólo challenge/proof y contabilidad propia, sin canje, request, binding o membresía.

Resend toma origen del challenge propio y revalida autorización, contacto y lista, sin reconstruir token. Conserva el origen en el reemplazo, los límites y el resultado original del replay. Revocación de active y autorización redeemed impiden otra emisión. La pending original conserva su deadline independiente; esa matriz mantiene pruebas pendientes.

## Evidencia parcial

- Primera emisión nativa ejerció código/proof/origen inmutable, pero el test terminó rojo en 123,63 s por esperar `23514` en el nivel exterior. Drizzle preserva la causa PG en `cause`; el guard real informó `personal verification challenge origin is immutable`. Se corrige sólo el oráculo de envoltura, sin cambiar producto.
- Emisión con migración final inicial: un caso verde en 114,63 s, con replay sin otro código, proof local y link active/version uno, cero solicitudes/vínculos.
- Resend nativo: un caso verde en 148,55 s, origen conservado y old challenge no actual, replay sin repetir, revocación cierra otra petición.
- Después del FK compuesto y extracción de fixture compartido: dos casos SQL verdes en 148,05 s, usando crypto/PG nativos y sin provider RPC.
- Negative invalid token/changed destination/revoked: un caso SQL verde en 49,57 s; cero códigos/code_request events/binding/admission propios.
- Regresión common issuer: un caso verde y siete gated en 60,02 s. Conserva código, ledger y consumo por validator real sin columnas personales en ese camino.
- Local verificación: 21 casos verdes; tipos producto/tests y lint verdes. El flag SQL mantiene separados los ocho casos gated del issuer y sus resultados explícitos.
- Phone/SMS personal: un caso SQL verde en 107,35 s, code/proof/origen reales, active/version uno y cero member/request/binding.
- Código personal → confirmación explícita: un caso SQL verde en 140,05 s, proof aplicada y link redeemed/version dos junto a una única pending manual, replay original sin otra presentación ni membresía.
- P2 de review: resend active no comprobaba retención de invitation_token tras retirar esa clave. Se añade seguridad fresca/token_key_id a la autorización del origen activo, manteniendo pending propia por linaje/plazo. La prueba específica perdió su handle terminal sin proceso vivo; no se atribuye un resultado a esa observación. Se repite con nuevo handle y termina un caso SQL verde en 98,42 s: retiro de clave impide otro code, pero replay del issue original se conserva.
- Pending personal nativa: un caso verde en 133,68 s, origen request/invitation exacto conservado en issue/resend, mismos status/version/timestamps/proof/binding de la solicitud y redeemed/version dos de la invitación. El código no modifica ni renueva la pending.
- El fixture de retiro se refina a nueva clave activa HMAC real de 32 bytes y clave anterior ausente, conservando un keyring válido. El snapshot exacto final pasa un caso SQL en 97,34 s; el ensayo previo con generateKey pasó 97,95 s, sin atribuirlo al fixture final.
- Suite ampliada de dominio/aplicación: 44 suites/476 casos verdes en 17,41 s, tipos producto/tests y lint verdes. Manual/arquitectura: check-manual sin errores y warnings locales conocidos, 24 renders Chromium/WebKit 1280/390 sin errores y 54 enlaces locales existentes.
- Rerun de review del código: cero adicionales, 13/14 estables y sólo drift declarado del keytest; target `BB7B10893AEA67EE75A35B0B29B8FFC4E3520962E738EB4266390639D0E4DD5D`. El delta final de keytest/documentos cierra limpio con seis hashes estables, `9D24C3A5619630874BFB71690B796527D68257DADBCA4D7CCC392F0631169088`; los trece archivos productivos/tests previos conservan su evidencia.
- CI final exit 0: lint/tipos producto/tests, 440 suites/4.488 casos verdes en 654,93 s; 148 suites/472 gated no se cuentan como integración. Build compiló en 39,6 s, TypeScript en 9,9 s y generó 48 páginas en 2,4 s. Los catorce hashes del snapshot `65EE85C314550D01BDA320F4BE2FAC54952F07F27D9AA8CBB44F2E0949AF5AF7` fueron estables hasta el resultado terminal.

Las validaciones del checkpoint terminaron; queda revisión focal de esta evidencia y trazabilidad al commit. Sólo ramas Neon propias; no se migran producción ni se envían mensajes reales. SC-021 terminó exit 0 con 1.000 comandos/800 admitted/200 pending/cero fallos, asserts SQL y cleanup; T107 se cierra por auditoría completa y se guarda en `d1eeba27`. El alcance restante de emisión/interfaz, T120 y gates conserva sus tareas: 107 completadas/105 pendientes de 212.
