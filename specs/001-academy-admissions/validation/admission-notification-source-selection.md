# Recorrido privado y finito de fuentes de avisos

## Alcance y decisión

Avance parcial de T185 sobre `6d30899e8cff3ebc7085a1b7001177e84741b83e`.
Las 212 tareas originales conservan 181 completas, 31 pendientes y 71
aprobaciones. No se completa una tarea o criterio por este incremento.

El nuevo puerto de dominio y su adapter PostgreSQL seleccionan referencias
por tribu en páginas de veinticinco más una fila de observación. El índice
versionado `20261016113152_index_admission_notification_source_selection.sql`
y su proyección modular sostienen la búsqueda por fecha original y UUID.
No se consulta un proveedor, se abre otro checkout ni se modifica el inbox.

La primera página fija el límite superior nativo y una ventana original de
veinticuatro horas. La continuación conserva ese reloj y todos los
desempates: microsegundos originales, obligación, destinatario y audiencia.
No se usa offset. Una supresión no reinicia la búsqueda; la selección
incluye también fuentes con miembros históricos y deja sus reglas de
actualidad con el collector. Un nuevo recorrido puede reexaminar las
fuentes todavía vigentes sin recrear su identidad lógica.

La autoridad de backend se comprueba antes y después de cada página. Un
cursor de otra tribu se rechaza y no se acepta un reloj/posición interno
fuera de su dominio. Los resultados contienen referencias, nunca contactos,
notas, claves o un permiso de despacho. La conversión nativa de timestamp
se comparte con la recolección anterior sin pasar por `Date`.

## Validación actual

Pasan **87 locales en tres archivos completos**, sin fallos u omitidos y con
2078 inputs estables. Tipos de producto/tests y lint completo pasan con
Node 24.21.0. La nueva integración SQL y la recolección anterior pasan en
**dos archivos completos: 2 aprobados / 0 fallos / 0 omitidos**, con **2077
inputs estables**. La ejecución terminó el 16 de octubre de 2026 a las
11:39:45 UTC y fue consumida con cero. Son **89 casos actuales distintos**,
sin sumar repeticiones o ensayos anteriores.

El escenario nuevo prepara más de dos páginas con fechas iguales,
destinatarios distintos y un miembro ya recolectado; no habilita correo ni
crea confianza o capacidad ficticias. Borra una referencia ya examinada e
inserta hechos nuevos después del primer reloj. Contrasta la continuación,
su replay, el final del recorrido y el acceso posterior a las fuentes nuevas
en un recorrido fresco, con controles de ámbito y autoridad final. La
consulta de efectos exige un único miembro original, cero entregas y cero
habilitaciones o cuentas confiables. No hay envíos.

La arquitectura pasa **cuatro vistas y 30 enlaces** en Chromium/WebKit a
390/1280, con fuentes estables, cero errores, enlaces faltantes o
desbordamientos. Las cabeceras y fuentes externas heredadas se conservan;
no se acredita funcionamiento sin red. La auditoría oficial posterior a
todos los productores confirma **cero ramas temporales propias y las tres
originales conservadas**.

## Límites conservados

El cursor es un checkpoint privado para el backend, no una capacidad
firmada o un estado duradero ya compuesto. Todavía no se integra su
persistencia/reanudación con el owner de mantenimiento. Una continuación
nula sólo termina el universo de ese recorrido; no significa cola global
vacía ni prueba ausencia de correo elegible. Ninguna selección autoriza
por sí misma a recolectar o enviar; cada fuente conserva su deadline y debe
pasar los hechos actuales del owner.

Siguen pendientes el freeze atómico con intent completo, la recuperación
funcional de grupos, su preparación/sender y el bucle de mantenimiento.
No se añade endpoint, scheduler, configuración de hosting o flujo público.
La [arquitectura](../../../docs/architecture/notifications.htm#admission-notification-source-selection)
conserva esas responsabilidades.

El [CI exacto de la base](https://github.com/guidomodarelli/TuTribu/actions/runs/38893791016)
terminó aprobado y fue consumido con cero: 533 archivos/5627 casos aprobados,
292 archivos/835 casos omitidos y 55 páginas. Acredita el checkpoint
anterior de procedencia de grupos, no este nuevo reader o su futuro commit.
La revisión conjunta y el nuevo checkpoint/CI conservan sus recibos propios.
