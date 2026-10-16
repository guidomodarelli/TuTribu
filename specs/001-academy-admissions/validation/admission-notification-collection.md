# Recolección privada de una fuente de aviso

## Alcance parcial de T185

Trabajo sobre `be71e80233b1e805d857cfe7537662c7fede79ea`. Se conservan
**181 tareas completas, 31 pendientes y 212 totales**, sus descripciones y
las 71 aprobaciones temáticas. T185 continúa abierta con todos sus criterios.

`AdmissionNotificationRepository.collect` y su adapter PostgreSQL unen un
aviso original existente con los readers actuales de destinatario confiable,
capacidad seleccionada, preferencia y habilitación. La unidad está acotada a
una fuente. Su caller conserva la transacción, autorización de propósito
backend, confirmación del commit y recuperación de una respuesta incierta.

La implementación toma primero el fence exclusivo de tribu, conserva los
locks del reader de cuenta y fuente, consulta el calendario nativo y vuelve a
leer el reloj después de las esperas. La política original selecciona la
identidad del bucket y el plazo de veinticuatro horas. La unicidad existente
conserva un miembro por obligación/destinatario/audiencia; `existing` devuelve
procedencia histórica, sin confirmar permiso actual de despacho. Solo se
persisten referencias de grupo y miembro.

El selector acotado y justo de todas las fuentes, la congelación atómica con
el intent completo del outbox, la procedencia explícita de grupo compatible
con recovery, el sender y la revalidación anterior al RPC siguen pendientes.
La composición todavía no expone esta operación mediante endpoint o scheduler.
Los resultados de una fuente no acreditan una cola vacía ni permiten concluir
la validación de US8, SC-015 o RG-08.

## Pruebas y diagnóstico actual

- Pasan **87 casos locales en tres archivos completos** de política de grupos,
  confianza del correo y preferencias. No sustituyen la prueba de persistencia.
- Lint completo, tipos de producto y tipos de tests pasan con Node 24.21.0.
- El primer Native termina 0/1 antes de invocar `collect`: la preparación
  intentaba crear una segunda candidata. La reproducción directa con `pg`
  confirma **SQLSTATE 23505**, `messaging_connection_candidate_key`, con una
  candidata preexistente y rollback. Se conserva ese original y la nueva
  conexión se prepara sin reclamar otro slot de candidata.
- La repetición siguiente también se detiene en la preparación, al insertar
  la habilitación de correo. `pg` directo confirma **SQLSTATE 23514** y
  `admission_email_enabled_time_check`: faltaba la época inicial. El control
  con `clock_timestamp()` es válido y se revierte. La preparación ahora
  conserva esa fecha nativa.
- Dos repeticiones posteriores alcanzan las comprobaciones de recolección,
  replay y rollback, pero se detienen en cambios de metadata del ensayo:
  usaba el rol inexistente `member` y luego retiraba evidencia sin su motivo.
  El fixture conserva ahora el rol real `tribemate` y el motivo de retiro
  exigido por el guard original. No se modificaron reglas o expectativas de
  recolección para acomodar esos errores. La ejecución actual completa pasa
  **1 caso, cero fallos y cero omitidos**, con **2065 inputs estables**. Los
  cuatro intentos anteriores se conservan; no se cosen sus assertions para
  sustituir este recorrido completo.
- La prueba funcional actual ejerce competencia del mismo aviso, replay,
  preferencia omitida, ausencia/ámbito, aviso anterior a habilitación,
  revocación posterior a una escritura observada con rollback, pérdida de
  rol, capacidad, confianza y habilitación. Comprueba ausencia de outbox y
  conservación del hecho interno. Los servicios SQL, confianza y crypto son
  reales; el guard de autoridad propio delimita la tribu sintética y no prueba
  un futuro endpoint bearer.

La documentación de arquitectura pasa cuatro vistas Chromium/WebKit a
390/1280 y 28 enlaces locales con fuentes estables. El DOM de su cabecera
coincide con el de la base y conserva las fuentes tipográficas heredadas; la
captura registra las solicitudes heredadas de Google Fonts. El primer auditor tomado
de otra página rechazó esas fuentes ya existentes; se corrigió su alcance,
sin atribuir ese resultado a un fallo de recolección o afirmar trabajo offline.

El [CI exacto de la base](https://github.com/guidomodarelli/TuTribu/actions/runs/38884241716)
terminó y fue consumido: 533 archivos/5627 casos aprobados, 290 archivos/832
casos omitidos y 55 páginas compiladas. No acredita por anticipado los archivos
nuevos ni un futuro commit de este avance.

## Límites conservados

No cambian SQL, esquema, migraciones, dependencias, configuración desplegada o
recorridos públicos. No hay una modificación de comportamiento alcanzable por
usuarios que requiera una entrada de CHANGELOG o nuevos manuales. La página
propietaria es [arquitectura de notificaciones](../../../docs/architecture/notifications.htm#admission-notification-collection).

La prueba usa únicamente ramas efímeras propias y datos sintéticos. Tras
consumir todos los productores, la auditoría oficial de Neon confirma **cero
ramas temporales propias y las tres originales conservadas**. El archivo
temporal de diagnóstico se retiró después de cada diagnóstico, comprobando
sus hashes de propiedad; se conservan los recibos privados sanitizados. No se acredita otro OAuth,
diagnóstico Zavu, aceptación externa, entrega o latencia operativa.
