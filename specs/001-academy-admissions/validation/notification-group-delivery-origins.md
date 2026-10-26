# Procedencia explícita de entregas de grupos

## Alcance parcial y decisión

Avance de T185 sobre `ae114ea1766d237f121b870087c6d4f5227d1c56`, con las
**212 tareas originales, 181 completas, 31 pendientes y 71 aprobaciones**.
Ninguna tarea o criterio se completa por este incremento.

El outbox distingue grupo y obligación con campos explícitos y mantiene la
referencia del grupo completo. La procedencia mínima pertenece a mensajería
y usa el namespace retenido, porque los grupos vivos desaparecen con la
tribu mientras sus entregas pueden conservarse. No se cambia el significado
de `obligationId` en el MAC anterior ni se usa la primera obligación para
representar el grupo. La clave lógica también distingue esos ámbitos si
coinciden sus UUID.

El artefacto versionado es
`20261016104149_bind_notification_group_delivery_origins.sql`, con su entrada
del journal y proyección Drizzle modular. Registra origen y outbox juntos,
exige grupo vivo congelado con destinatario/audiencia/vencimiento exactos y
conserva los campos inmutables. El guard adicional de recovery compara la
procedencia con el original sin reemplazar los guards de ledger/auditoría.
El origen privado se conserva durante el retiro vivo y se retira con su
última referencia de entrega. RLS forzada y ACL propias preservan su ámbito.

## Validación actual

La reproducción inicial corre el primer caso real, con el segundo fuera del
filtro: **0 aprobados / 1 fallo / 1 excluido**. Falla en la lectura de los
campos de grupo ausentes, después de preparar el grupo y una entrega individual
mediante SQL real. El log inicial conserva un indicador `filtered:false`
impreso por el helper heredado; los argumentos y el informe de Vitest
acreditan el filtro real. No se presenta como ejecución del archivo completo.

La primera cohorte completa termina **1 aprobado / 2 fallos**, sin omitidos:
la recolección corregida pasa. El caso de procedencia se detiene al eliminar
la tribu; `pg` directo observa **SQLSTATE 23502**, tabla
`academy_admission_decisions`, columna `policy_version`. El fixture anterior
había creado solicitudes con snapshot vacío. Ahora se guarda el snapshot del
constructor real del dominio al crear esas filas, sin modificar un original
persistido o relajar los guards de retiro.

La recuperación individual confirma sus campos nuevos nulos y el replay,
pero su expectativa inicial comparaba también `replayed:false` con el
indicador correcto `true`. La expectativa actual conserva todo el resultado
y UUID originales y exige explícitamente `replayed:true`, conforme al
contrato del ledger. No se cambia la recuperación de producto.

La cohorte actual repite los dos archivos completos con las preparaciones y
expectativas corregidas: **3 aprobados / 0 fallos / 0 omitidos**, con **2071
inputs estables**. Terminó el 16 de octubre de 2026 a las 11:21:38 UTC y fue
consumida con exit cero. No se suman los intentos anteriores. Comprueba rollback de origen
y outbox observado, aislamiento de ámbito, audiencia, deadline sin un
microsegundo extra, unicidad por tipo explícito, identidad, RLS con grant
adverso, retiro físico y limpieza de última referencia. El segundo caso
ejecuta la recuperación individual real y su replay con los campos de grupo
nulos. El escenario usa solo metadata sintética: no prepara ni envía mensajes.

Se corrigió el contador negativo de la prueba de recolección para consultar
`admission_notification`, el propósito real del outbox. `notification` es la
categoría del presupuesto y no identifica esas filas. El escenario nuevo
incluye un control positivo del propósito, sin convertir el cero anterior
en evidencia de entregas de la categoría correcta.

Pasan **272 casos locales en 17 archivos completos**, con tres SQL omitidos
de sustitución que no se ejecutan por esa omisión ni se confunden con los
casos Native de esta cohorte. Tipos de producto/tests y lint pasan; las
fuentes permanecieron estables durante la ejecución local.

Las dos páginas de arquitectura pasan **ocho vistas y 78 enlaces** en
Chromium/WebKit a 390/1280, sin errores, enlaces faltantes o desbordamientos.
Sus fuentes son estables; las cabeceras y fuentes externas heredadas se
conservan y no se afirma funcionamiento sin red. La auditoría oficial de
Neon posterior a todos los productores confirma **cero ramas temporales
propias y las tres originales conservadas**.

## Límites conservados

Este almacenamiento no prepara un subject/body completo ni acredita confianza
actual, preferencias o permiso de despacho. La recuperación funcional de grupos
y su preparación privada, el selector justo/acotado y el freeze atómico con
intent completo permanecen pendientes junto con sender y mantenimiento. No
se publica un endpoint o scheduler. La fuente de arquitectura está en
[mensajería](../../../docs/architecture/tenant-messaging.htm#notification-group-delivery-provenance).

El [CI exacto de la base](https://github.com/guidomodarelli/TuTribu/actions/runs/38888071002)
terminó y fue consumido: 533 archivos/5627 casos aprobados, 291 archivos/833
casos omitidos y 55 páginas. No acredita por anticipado este cambio SQL o su
futuro checkpoint. La revisión de código terminó sin hallazgos; la revisión
conjunta del incremento y su nuevo CI conservan evidencia propia. No se modifican base productiva, hosting,
dependencias o recorridos públicos, ni hay mensajes reales.
