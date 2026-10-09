# Persistencia y confirmación de importación

T115 conecta puertos/use cases y composición nativa con preview, lectura, confirmación por bloques y reporte. T116/T118 conservan endpoints/pantalla pendientes; no se declara disponible toda la importación en la aplicación ni preparado el runtime general.

Preview compara política/tipo bajo locks, mantiene el actor/tenant actuales y registra filas temporales con datos/validaciones originales y una huella protegida. No agrega entradas ni vincula cuentas. Confirmar exige selección explícita y versión vigente; los resultados `added/unchanged/skipped/conflict` quedan ligados a su operación y versión originales. Entradas deshabilitadas o recientemente editadas conservan sus datos y producen conflicto. Las filas no seleccionadas se registran como omitidas al finalizar, sin tratar una omisión como una entrada agregada.

`runChunks` confirma una transacción por bloque, renueva la lease con CAS y deja la operación started hasta su snapshot final. Un bloque inesperadamente fallido revierte sus datos/auditoría/outcomes y conserva los commits anteriores. La selección aceptada tiene su ledger inmutable, de modo que una nueva confirmación de pendientes puede reanudar y luego conciliar la operación original sin repetir éxitos. Las respuestas perdidas se consultan antes de redispatch; ninguna lectura crea/reclama operaciones.

## Evidencia ejecutada

- Use cases: cinco casos locales verdes con resolver/CSV reales y dobles sólo en puertos propios, incluyendo recencia exacta antes de parsear, formato inválido, guardián cerrado, confirmación por recurso y progreso original genuino.
- Template/reporte: trece casos verdes, encabezado exacto, comas/comillas/newlines/HTML inertes y prefijos de fórmula/control/ancho completo neutralizados. El archivo es para lectura humana; no se afirma protección universal si otra herramienta transforma o vuelve a guardar sus datos.
- Regresión local conjunta: 57 casos verdes en seis suites; ronda posterior de cinco suites: 43 verdes. Tipos/lint verdes.
- Driver SQL nuevo: 1/1 verde en 89,42 s. Primer row commit permanece tras rollback del bloque siguiente; se reanuda sólo pendiente, y replay confirmado/cambio de intent no repite efectos. El rojo inicial con el método pendiente se preserva.
- Importación SQL final: 2/2 verdes en 318,95 s. Treinta registros: veinticinco éxitos sobreviven al rollback posterior, cinco pendientes se retoman con otro UUID y la original se concilia sin duplicar entradas/auditoría. Caso mixed conserva `unchanged/added/conflict/skipped`, versiones originales, disabled sin reactivación, preview sin efectos de lista y cero bindings. Ronda previa de dos casos también verde en 304,14 s, antes de integrar omisiones.
- Capacidad/autoridad SQL: 1/1 verde en 143,27 s con diez mil filas reales persistidas en preview y cero entradas; edición reciente produce conflicto, cambio de epoch cierra efectos y pérdida de liderazgo cierra lectura/preview.
- FORCE RLS: se reprodujo PostgreSQL 42501 con un owner sin BYPASSRLS. La policy canónica de owner corrigió la escritura, manteniendo request roles cerrados aun con grants DML explícitos; ronda final 1/1 verde en 57,96 s.
- Deadline dentro del bloque: 1/1 verde en 79,30 s con un plazo inmutable corto, trigger temporal de espera y sequence no transaccional que comprueba que hubo staging. Tras vencer, entrada/outcome/auditoría del bloque se revierten. No se desactivó ninguna guarda productiva.
- Deadline después del callback: 1/1 verde en 44,91 s; se espera entre staging y commit, la constraint diferida devuelve 23514 y la fila confirmada no queda persistida.
- Regresión de ledger anterior SQL: tres casos seleccionados verdes en 66,03 s (trece casos fuera de selección). Incluye replay antes de CAS obsoleto, dos claims concurrentes con un solo efecto y respuesta perdida sin repetición.
- `pnpm run ci` previo verde: 424 suites/4.398 casos aprobados, 110 suites/425 casos no seleccionados; build 29,6 s, tipos 9,8 s y 47 páginas. La ronda final también terminó exit0: 424 suites/4.398 casos verdes (425 no seleccionados), duración de tests 555,18 s, compilación 12,5 s, tipos de build 1,939 s y 47 páginas. El test nativo diferido añadido durante esa corrida se ejecutó aparte, sin skip, y los tipos de tests completos se repitieron después de agregarlo.
- Arquitectura `.htm` actualizada: cuatro renders Chromium/WebKit a 1280/390 px, cero desbordes/errores JS. No se crean capturas o recorridos de una pantalla CSV todavía ausente.

## Correcciones y revisión

La revisión encontró dos P2: policy owner faltante bajo FORCE RLS y falta de recheck de deadline después de filas/claves. Ambos se corrigieron con regresiones reales. Se agregó retención de la clave de contacto utilizada y una constraint diferida para las esperas posteriores al callback. Los guards/migración conservan originales y no amplían permisos de request.

La fixture temporal inicial falló 23514 porque tres clocks independientes excedían la desigualdad de veinticuatro horas por un microsegundo; se corrigió a un único sample SQL. La ronda siguiente venció antes de staging (`sequence=false`) y no acreditó la carrera; la fixture se ajustó a treinta y cinco segundos, dentro de la lease existente de noventa segundos. No se modificaron límites o timeouts productivos. En el test diferido, el primer ensayo leyó sólo `cause.code`; el error de commit estaba en `error.code`. Se corrigió el narrowing del test y se verificó el 23514 real, sin ocultar el rojo.

Review read-only de fixes: 0 adicionales; target de dieciocho archivos `7C25A892E5A01040432D5A5C1D8F23334BD995AF2A337772E39F094C923BE37D`, diecisiete estables y cambio declarado del test temporal. Review de omisiones/deferred guard: 0, diecinueve hashes estables, `359DC524C7A50E47D52906B72B273D3FD8B83A0E9F1B4492A0F4069A85D01520`. Se verifica el delta final de test/evidencia antes del commit.

Todas las migraciones/pruebas SQL se ejecutaron exclusivamente en ramas efímeras propias, con cleanup. No se migró la rama default ni se enviaron mensajes reales de proveedor. El reporte sigue [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection); el worker de purga y los recorridos/API conservan su alcance pendiente.
