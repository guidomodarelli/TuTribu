# Activación y reemplazo de conexión

Incremento sobre `d03aa9ab5914047990321e6eb5ef9158934c69e6`. El usuario autorizó checkpoints de commit y push; no se publica ni despliega. Permanecen 76/212 tareas completas y 136 pendientes hasta auditar íntegramente sus cláusulas.

El caso de uso, puerto, writer transaccional, adapter de dependencias, handler y root nativos conectan activación explícita sin proveedor ni plaintext. La credencial debe estar validada como producción y los canales configurados/dependientes requieren diagnóstico local exacto de la versión dentro de veinticuatro horas. La política de uso sigue en su owner único.

Reemplazar actualiza sólo la referencia anterior exacta en una política existente, incrementa su versión y registra auditoría. No cambia modo, apertura, flags de verificación, época, países o cupos. Invalida pruebas disponibles y desafíos actuales de admisión del recurso anterior; preserva pruebas aplicadas, solicitudes, plazo y reservas consumidas. Retira la versión/envelope anterior con purga prevista y cancela únicamente cola sin intento. La purga OTP queda limitada a deliveries anteriores de este scope.

## Validación en curso

- Dos casos application y dos casos HTTP locales pasaron (`90520`, 2,07 s); tipos y lint verdes.
- SQL inicial pasó un caso (`9993`, 369,20 s). SQL posterior (`9185`, 491,83 s) comprobó rechazo de sandbox/diagnóstico de 25 horas, selección inicial, replay y defaults preservados con los owners actuales.
- Build `77050` pasó compilación en 106 s, tipos en 39,5 s y generación de 45 páginas, incluido el endpoint activate. Precede la corrección concurrente todavía en curso.
- Native `81456` pasó un caso en 705,66 s sobre ese build: creación/configuración/validación, diagnóstico recibido y verificado localmente, activación inicial, replay original sin otro SDK y GET de configuración seleccionado. No completa el caso concurrente posterior.
- La revisión Codex encontró un P2 de frescura: se evaluaba antes de los locks de entregas anteriores. Manifiesto estable de 15 archivos `9BCDBB2F22DFF065C7726EFDD54007A035314039C3684E7037A7F3EC8EE46548`. La primera ejecución concurrente `54142` falló por la conexión de fixture inactiva durante el lock; no acredita reproducción del bug. La segunda `96941` mantiene activo ese checkout con consultas SQL y conserva el guard de plataforma, observa `pg_blocking_pids` y deja vencer la prueba con reloj SQL. También verifica rollback y posterior reemplazo con prueba vigente; está en ejecución antes del fix.
- Siete casos application/HTTP pasaron (`7cb47b`, 2,36 s), y los tipos de tests reales pasaron (`9adfce`). Los dos manuales pasan sus checkers (`e98f7d`, `094ea7`), con avisos esperados de documento local sin URL publicada ni catálogo de traducciones.
- QA `3a5ae0` cerró normalmente con 20 renders de cinco documentos en Chromium/WebKit a 390/1280, cuatro navegaciones menú/retorno y cuatro recargas con ancla de activación. Cero desbordes o errores JS. El run anterior `85171` había fallado por un selector del propio script; no se atribuye como verde. Checker `46c3d3`: 143 enlaces, cero errores; diff whitespace limpio.
- Lint global `a39520` verde. Suite local ampliada `48b4d3`: 35 casos verdes, seis SQL omitidos, cuatro archivos pasados y uno omitido, 2,10 s. Los casos omitidos no se acreditan; el filtro incluía además una ruta prevista de test inexistente.

La UI de asistente, retiro/suspensión operables, preferencias, gates externos y el resto de la feature siguen pendientes. Esta evidencia no completa por sí sola T076/T081/T086/T091/T092 ni certifica Zavu o Google productivos.

## Reproducción y corrección de frescura

SQL `96941` reprodujo el P2 en 414,53 s: un bloqueo real observado dejó superar las veinticuatro horas y la activación cumplió cuando debía rechazar. El guard de inactividad se conservó en el fixture; no se modificó la plataforma. Se agrega reevaluación pura usando el snapshot protegido original y reloj SQL actual después de dependencias/locks y otra vez después de purgar material. Una denegación revierte selección, referencias, pruebas y retiros en la misma transacción. El rerun completo todavía debe confirmar ambos casos.

Build posterior `41092` verde: compilación57 s, TypeScript6,7 s y45páginas, con el endpoint de activación y el fix. Types tests `17966`, lint global `422645` y35casos/4suites locales `23640` verdes. Rerun SQL `43040` en curso, con ambos casos sin filtro; el Native posterior se ejecuta sobre este build. No se modifica producto durante esos ensayos.

Revisión posterior del mismo proveedor Codex: cero hallazgos accionables; P2 cerrado por código. Manifiesto estable de16archivos `E6F78FEFB08954F2C116341F2E58BC1ED95050A0309815AFD88ECE65A7558F8D`. No ejecutó pruebas; SQL43040/Native48082 seguían vivos y deben cerrar antes de acreditar el incremento. El registro de proveedores siguiente fue excluido expresamente de este target.

Native posterior `48082` terminó con exit0, un caso en654,54s sobre build41092. Conserva tres operaciones SDK reales contra transporte cerrado, un delivery/intento/reserva, ningún proof de admisión ni evidencia global; confirma/repite activación y lee selected/candidate sin otro envío. El cierre de proceso quedó comprobado en `f551fc`.

SQL43040 terminó rojo857,06s: pasó la selección inicial y el caso concurrente comprobó rechazo/rollback, pero falló su posterior confirmación al reutilizar el UUID rechazado dentro del lease activo de90s. Se verificó el contrato real del ledger; una nueva prueba/confirmación usa operación nueva, y replay conserva sólo la operación completada nueva. Se corrige el fixture, no se debilita el lease ni se modifica el writer. El reemplazo posterior completo aún requiere el rerun focal.

Revisión final de ese ajuste: mismo Codex, cero hallazgos accionables y16hashes estables, manifiesto `C4376B40FF309B175341DB4B64788202A6A7E624C6F6516815B4FE8C26188812`. Source productivo sin cambios; confirma UUID nuevo y replay original. SQL91790 seguía pendiente al revisar.

SQL91790 terminó verde468,80s, un caso focal y uno excluido por filtro: rechazo/rollback ante diagnóstico vencido durante lock real, nueva confirmación válida, referencias de política coherentes, flags/época preservados, retiro de versión/envelope anterior, pruebas sin usar invalidadas y prueba aplicada/solicitud/reservas/accepted/unknown conservados. Replay de la operación completada no agrega SDK ni escrituras. Sumado a la selección inicial verde de43040 y Native48082, cierra este incremento. Las tareas completas permanecen76/212; no acredita los alcances de asistente/suspensión/preferencias/gates externos.

Cleanup `b2e2a9` confirmó ausentes las seis ramas anteriores propias. Las ramas de91790 y29014 todavía requieren comprobación explícita de ausencia después de sus exits, sin tocar recursos ajenos.
