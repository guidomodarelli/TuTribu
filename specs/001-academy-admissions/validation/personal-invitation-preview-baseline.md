# Preview nominativo — lectura y HTTP

Incremento sobre `9d47c88e`. No completa T127/T128/T129 ni modifica gates productivos. Se integra reader/use case/proyección y endpoint de lectura; página, container, administración por pantalla y emisión de código personal conservan sus tareas.

Sin sesión la aplicación devuelve sign_in_required sin consultar el token. Con sesión actual, lookup HMAC/contexto exacto y locks de lectura permiten resolver hechos privados. Wrong-account, ausencia, revocación y OFF sin evidencia suficiente no revelan tribu ni destinatario. El DTO autorizado contiene sólo overview propio, restricción y resultado esperado; excluye contacto, nombre interno, token/digests y referencias OAuth. ON exige prueba local para confirmar; ofrecer el paso no concede acceso.

La pending canjeada se reconoce mediante user/request originales. Expiración del enlace no modifica su plazo; una pendiente común existente no consume otra personal. El reader no usa writer, issuer ni ledger y vuelve a comprobar sesión/seguridad después de los waits. El root privado conserva actor nativo en conexión backend, sin exponer un puerto administrativo innecesario.

## Evidencia parcial

- Primer reader/use case nativo: un caso verde en 106,90 s, anónimo/correct recipient/forwarded/invalid/revoked. Invitación active versión uno; cero solicitudes, vínculos, códigos y operaciones de las cuentas. La revocación explícita pasa a versión dos; leer no incrementa.
- Proyección se extrae a `application/results`, dejando sesión/lectura en el use case. Se reemplaza el booleano ownedRedemption por linaje privado user/request y se agregan regresiones contra otra cuenta/request, pending propia previa y token revocado.
- Local final: once casos verdes en dos suites, 834 ms, tipos producto/tests y lint verdes. Schema real de DTO rechaza hints privados; Zod no se aplica a filas PG. El oráculo HTTP inicial suponía 502 para public_contract_unusable; catálogo/contrato canónicos definen 500 y se corrige el test sin alterar ese mapeo.
- Reader final tras extracción/linaje: un caso verde en 96,12 s. Misma integración nativa y ausencia de efectos.
- Endpoint GET valida inputs antes de abrir composición, headers privados incluso en rechazo, correlación segura y diagnóstico fijo sin raw URL/token. Ronda de código congelada en catorce archivos para revisión independiente.

- Build real exit 0: compilación 48 s, TypeScript 8,7 s y 48 páginas en 4,1 s; incluye el route nuevo en el inventario real.
- HTTP real con Next/Better Auth/PG: un caso verde en 81,60 s. Usa cookies firmadas y keyrings privados compartidos sólo en memoria, anónimo/cuenta correcta/reenviado/token inválido, headers no-store/no-referrer y cero request/bindings/challenges. El server y rama propios se cierran antes de concluir.
- Phone ON nativo: un caso verde en 44,09 s. Consulta canal SMS/países vigentes, ofrece verify_contact sin exponer número ni nombre interno/token y conserva active/version uno, cero solicitudes, vínculos o códigos del solicitante.
- Suite ampliada de dominio/aplicación: 44 suites/474 casos verdes en 34,04 s. Tipos producto/tests y lint verdes.
- Manual y arquitectura: check-manual sin errores (warnings locales conocidos por URL pública/catalogue ausentes), 24 renders Chromium/WebKit a 1280/390 sin errores. No se agregan capturas de la página personal aún pendiente.
- Revisión inicial: dos P2 aceptados y reproducidos rojos. Un binding telefónico de otra cuenta con prueba vieja permitía el hint ON; se cierra el binding ajeno antes de proyectar y sólo se trata como prueba disponible un resultado admitted/pending de la evaluación real. Una policy pública incoherente con la interna predecía admitted; se comparan sólo campos propios consumidos y closure facts antes del DTO, sin schema sobre filas PG.
- Fixes locales: trece casos verdes en dos suites, 834 ms, tipos producto/tests y lint verdes. Phone con binding ajeno real: un caso verde en 55,03 s, owner intacto, invitación active/version uno y ningún canje.
- Tercer P2 reproducido rojo: el email actual distinto cerraba una pending ya canjeada por el mismo userId/request. Lectura propia prioriza ahora ese linaje exacto, conservando la coincidencia actual para un canje nuevo. Trece focales verdes en 796 ms. SQL específico de cambio de correo pasó un caso en 87,66 s: pending/user/request y versiones originales intactos, otra cuenta cerrada.
- SQL después de los dos primeros fixes: dos casos verdes en 95,72 s (email y phone/binding ajeno); el tercer fix conserva su validación separada.
- Rerun de revisión final: cero hallazgos accionables, 17/17 hashes y HEAD estables; manifest `60CA8156107FB0A77931364B0F45804B2A9255D5DB0B1BB1737DBA2FADD1137A`. Se reutilizan once archivos sin cambios. El SQL de cambio de correo terminó después del inicio de esa ronda y su resultado terminal está registrado arriba, sin inferirlo del reviewer.
- Revisión documental final: cero accionables, cinco hashes estables; manifest `D766DDC3719FDB66BD69977A5732EB8CDB8FC269D124B59F382690B80FD44923`. Se conserva la distinción de página/issuer pendientes y el histórico de fallos.
- CI final exit 0: lint, tipos producto/tests, 440 suites/4.488 tests verdes en 584,40 s; 141 suites/465 tests gated no acreditan integración. Build compiló en 34,8 s, TypeScript en 5,3 s y generó 48 páginas en 2,7 s. Los 17 hashes del snapshot `60CA8156107FB0A77931364B0F45804B2A9255D5DB0B1BB1737DBA2FADD1137A` permanecieron estables hasta la salida terminal.

Validaciones del checkpoint terminadas; queda revisión focal de esta evidencia y trazabilidad de manuales al commit resultante. Muestra SC-021 sigue su handle original con observación parcial 850/1.000, 800 admitidos/50 pendientes y cero fallos; todavía faltan 150 presentaciones y asserts/cleanup finales, sin cierre acreditado. T127/T128/T129 y los gates operativos siguen abiertos.
