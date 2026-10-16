# Proyección de capacidades y formulario de mensajería

## Alcance de T195

Código guardado en `377903c60006ed41d39512768ff274f148537d01`, sobre
`2e01128f0955999f1e9baef5599cb7cc4b372177`. La ruta prevista
`components/academy-admissions/messaging-connection-form/index.tsx` no existe:
el recorrido real usa `messaging-connections`, `messaging-connection-resources`
y el container/controller de la hoja de conexiones. Se conserva la descripción
original de la tarea y se documenta esta correspondencia.

`MessagingProviderCatalogReader` entrega un contrato propio con ID y canales
implementados. La composición lo obtiene del registro real, cuyo único proveedor
productivo continúa siendo Zavu. No agrega un selector de proveedores futuros,
capacidades telefónicas ficticias, consultas SQL, carga de claves ni RPC para
mostrar el catálogo.

El loader entrega esa metadata sólo al líder después de comprobar de nuevo la
cuenta y la sesión. Su DTO público rechaza ausencia, vacío, duplicados,
proveedores/canales desconocidos y campos privados. El guardián conserva una
alerta mínima y no recibe los catálogos de administración. No cambia el DTO de
configuración ni la recuperación de operaciones existentes.

El formulario usa los canales recibidos y muestra plantilla e idioma sólo para
WhatsApp. Una propuesta no disponible invalida el consentimiento, muestra un
aviso y no consulta ni guarda. La corrección limpia el aviso y requiere una
confirmación nueva. Las props no conceden autoridad: el servidor conserva sus
comprobaciones actuales de cuenta, rol, conexión, versión y proveedor/canal.

## Evidencia aprobada

| Comprobación | Resultado y límite |
| --- | --- |
| Familia local completa | 64 aprobados, cero fallos u omitidos, en cuatro archivos completos; fuentes estables. Incluye DTO válido/inválido, catálogo sólo correo, proveedor desconocido, privacidad del guardián, controles reales de beez-ui, bloqueo de acciones y regresión del asistente. |
| Recorrido nativo completo | Cuatro aprobados, cero fallos u omitidos: Chromium y WebKit a 1280 y 390 px, con Next, Better Auth y PostgreSQL reales en ramas propias. Son cuatro combinaciones de motor/ancho, no los cuatro AC integrales de US12. |
| Comportamiento nativo | El estado inicial ofrece Correo, SMS y WhatsApp desde las props; WhatsApp muestra sus campos y SMS los retira. Los cambios no hacen consultas browser de configuración/recursos, llamadas al proveedor ni envíos. No hay errores de página ni desbordes. |
| Tipos y lint | Tipos de producto y tests aprobados; lint de los catorce archivos iniciales y del test nativo, repetido después de corregir su preparación, aprobado. |
| Compilación real | Exit cero, 1803 archivos de producto y 2069 de overlay en el checkout aislado propio, 55/55 páginas. El producto compilado conserva sus bytes durante las pruebas y el checkpoint guarda los diecisiete archivos revisados sin cambios de hooks. |
| Recursos | Auditoría oficial posterior a los productores: cero ramas temporales propias, tres ramas originales conservadas; no hubo borrado ajeno. |

Archivos de pruebas efectivos:

- `tests/unit/modules/messaging/application/messaging-connections-page.test.ts`
- `tests/unit/components/academy-admissions-messaging-resources.test.tsx`
- `tests/unit/components/academy-admissions-messaging-connections-container.test.tsx`
- `tests/unit/modules/messaging/application/messaging-resource-capabilities.test.tsx`
- `tests/unit/modules/messaging/infrastructure/messaging-resource-fields-browser-ui.test.ts`

Son **68 casos aprobados distintos** entre las dos familias finales. No se suman
repeticiones, omisiones ni fallos históricos al total.

El [CI exacto del código `377903c6`](https://github.com/guidomodarelli/TuTribu/actions/runs/38871901638)
terminó aprobado: **533 archivos y 5625 casos**, con **288 archivos y 830 casos
omitidos**, tipos/lint y build de **55/55 páginas**. Su watcher terminó y fue
consumido con exit cero. Esos omitidos no se convierten en evidencia nativa;
los cuatro recorridos anteriores tienen su ejecución real separada. El CI de
este código no acredita por anticipado el checkpoint documental posterior.

## Fallos conservados y corrección del ensayo

La primera familia nativa conserva cuatro fallos antes de abrir los navegadores:
el POST de creación respondió 404 en lugar de 201. Un aislamiento adicional
conserva un fallo y acredita, mediante `pg` directo, una tribu, una configuración
de academia, una identidad de routing público y un líder activo. El cuerpo propio
indicó `resource_unavailable`; PostgreSQL no indicó ausencia de esas filas.

La inspección encontró configuraciones sintéticas diferentes entre el fixture
que registra las attestations MAC y el servidor que ejecuta la operación. El
ledger exige continuidad de ese material y traduce su fallo criptográfico a un
resultado propio cerrado. Se compartió la misma configuración sintética entre
`prepareMessagingConnectionCreation` y `withAdmissionNextServer`. Las cuatro
repeticiones completas pasaron conservando 201, cero RPC y todas las comprobaciones.
No se modificó la seguridad, el presupuesto, el SQL ni una expectativa para
aceptar el 404. Las claves sólo existieron en memoria de los procesos del ensayo.

## Documentación y revisión

La [arquitectura propietaria](../../../docs/architecture/tenant-messaging.htm#provider-registry)
describe el puerto y la proyección SSR. El
[manual temático](../../../user-guides/tenant-messaging.html#channel-resources)
y ambos índices documentan la visibilidad y la corrección del canal, trazados
al código guardado `377903c6`. Se conservan sus 32 capturas anteriores sin
presentarlas como recapturadas. Cinco fuentes del documento se incorporan desde
los recursos con licencia ya usados en el menú para permitir lectura sin conexión.

El checker canónico termina con cero errores. Sus dos advertencias corresponden
a documentos locales sin URL de publicación y a la ausencia de un catálogo
central de traducciones. Los hosts adicionales permitidos son atribuciones de
licencias de fuentes/CSS conservadas, no solicitudes externas del manual.
La navegación pasa doce vistas y cuatro recorridos en ambos motores a 390/1280,
con 181 enlaces válidos, marcos completos, sin desbordes ni errores de JavaScript,
incluida apertura local sin servidor.

Los primeros helpers de documentos conservaron dos fallos de selector: suponían
un acordeón de preguntas frecuentes y la clase de regreso de otro manual. Este
manual tiene preguntas estáticas y un enlace real al menú. Se corrigieron sólo
los probes; el informe final completo conserva fuentes estables. La normalización
LF exigida por Git mantiene el DOM idéntico y elimina la falsa advertencia de
boilerplate causada por la escritura CRLF del helper de trazabilidad en Windows.

Dos revisiones consultivas del mismo reviewer Codex no encontraron hallazgos
accionables: la primera sobre el incremento y la segunda sobre la preparación
nativa corregida, con los demás dieciséis archivos idénticos. El cierre documental
y su inventario requieren la revisión conjunta final y un checkpoint propio.

## Límites de cierre

La evidencia sustenta únicamente T195. T196 conserva el contrato documental de
extensión completo y T197 la validación integral de US12/SC-020. Sus filas normativas,
el resto de las 212 tareas y los gates operativos mantienen sus requisitos.
No se acredita otro proveedor productivo, entrega externa, Google operativo,
hosting Workers, scheduler, usabilidad humana ni rollout. El control de calidad
del código `377903c6` tiene su workflow automático propio; el checkpoint documental
debe conservar su resultado de CI separado. T211 sigue abierta.
