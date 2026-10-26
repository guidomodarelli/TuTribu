# Configuración independiente del correo de admisión

Checkpoint parcial de T184 sobre la base `c670194e9916fe5fd7c9fc6ff84d636ca8371175`. Las tareas completas de US8 conservan su alcance y estado: 174 terminadas y 38 pendientes de 212. El writer de configuración todavía no está compuesto en un endpoint o formulario.

## Comportamiento implementado

- La consulta ausente devuelve OFF, zona `America/Argentina/Buenos_Aires`, versión implícita cero y ningún corte; no crea ajustes ni pide recencia.
- Una modificación exige liderazgo canónico, academia, sesión vigente y confirmación reciente específica `update_admission_email_settings`. La confirmación de reglas de ingreso no autoriza esta acción.
- CAS se verifica antes del no-op. Un cambio efectivo incrementa la versión una vez; un no-op conserva sus valores originales.
- Activar, reactivar o cambiar la zona mientras el correo está activo inicia un corte nativo nuevo. El productor deberá respetarlo para excluir eventos anteriores. Desactivar retira el corte y no requiere capacidad de correo disponible.
- Habilitar un cambio efectivo consume el owner de readiness: conexión seleccionada del líder actual, versión exacta, credencial de producción, remitente y capacidad de correo preparada/probada, entorno/época y clave actuales. Repite los controles después de persistir y vuelve a leer el runtime local.
- Un cupo de códigos en cero no impide habilitar avisos con correo preparado. No se cambia la política OTP, selección de conexión ni preferencias personales.
- El ledger conserva UUID e intent originales, confirma ajuste/auditoría juntos y recupera una respuesta perdida antes de repetir. Un replay conserva su resultado histórico; GET resuelve el estado actual por separado.
- El protocolo compartido del ledger sigue exigiendo claves vigentes y recovery lock abierto incluso al desactivar. No se omite ese control.
- La auditoría tiene categoría y evento propios en la actividad. Selecciona versión anterior, habilitación y zona; el primer cambio conserva la ausencia de versión anterior, sin inventar una versión persistida cero. Las proyecciones pública y de retiro descartan contactos y credenciales.

## Persistencia y validación real

La migración `20261015172500_manage_admission_email_settings.sql`, entrada 175 del journal, agrega la zona al almacenamiento existente, fuerza RLS y amplía el guard de inserción/versión/fecha. PostgreSQL comprueba zonas reconocidas y fija el corte después de las esperas. La lectura preserva microsegundos exactos; no convierte el corte a `Date`.

Pasaron **68 casos locales en ocho archivos completos y disjuntos**: 21 nuevos de modelo/aplicación/auditoría y 47 de regresión. Sin filtros ni fallos y con inputs registrados estables. El rojo de auditoría ejecutó sus dos casos y reprodujo el recurso aún no soportado. Los rojos de módulos ausentes fueron errores de carga y no se cuentan como SQL rojo.

El archivo Native actual completo pasó **3/0, sin filtros y con 27 inputs registrados estables**. Comprueba selección/capacidad exactas y cupo de códigos cero, cortes y no-op, desactivación sin la clave anterior de credencial, replay/respuesta perdida/CAS, aislamiento RLS y consulta real de la auditoría. El tercer caso observa ajuste y auditoría preparados antes del error de sesión, propaga el error y verifica su rollback completo; también ejecuta escrituras directas inválidas de zona, versión y corte contra el guard original.

El fixture Native carga únicamente metadata sintética de identidad y configuración persistida, con cifrado, PostgreSQL, pg y Drizzle reales. Instala el journal completo y conserva todos los guards. No acredita otro OAuth, recepción diagnóstica, activación de conexión o envío externo. El ensayo inicial que repetía el alta completa terminó con tres fallos y se conserva como diagnóstico; no se suma a la validación actual ni se presenta como verde.

El build aislado real terminó con código cero: 53 páginas y **1740 archivos de producto equivalentes** al checkout, con inputs estables. No se duplica el CI completo local; GitHub Actions sigue siendo su owner.

La página construida pasó **un caso Native completo en cuatro vistas**: Chromium y WebKit a 1280 y 390 px, sin errores de página ni desbordes. Ejercita el filtro de recursos, la consulta real y los campos de habilitación y zona del evento propio. Exporta una captura real con datos sintéticos para el manual. El total actual es **72 casos distintos**: 68 locales, tres Native de almacenamiento y uno Native de navegador; las cuatro vistas no se suman como otros cuatro casos.

Los intentos anteriores con un plazo de 30 segundos vencieron al buscar la región o consultar un diagnóstico HTTP. El intento vigente usó el plazo Native canónico de 90 segundos. No se demuestra una mejora de latencia del producto ni el cumplimiento de p95; se conserva el diagnóstico anterior separado de la evidencia actual. La observación de PostgreSQL no encontró procesos bloqueados durante la inspección.

El manual conserva sus 51 capturas anteriores y agrega sólo la del historial de avisos por correo, con cinco puntos de referencia. Se comprueban sus enlaces y su comportamiento real en Chromium y WebKit; la referencia de código se registra con el commit guardado de este incremento. La documentación de arquitectura tiene cuatro vistas sin desbordes. El [registro sanitizado de resultados](admission-notification-email-settings-results.json) distingue los casos, sus inputs y el alcance comprobado.

La conciliación oficial posterior dejó **cero ramas temporales propias**. Conservó producción, el piloto original y `dev-sandbox-guido`, una rama ajena a este trabajo. No se eliminó esa rama ni se enviaron mensajes externos. El worktree de validación se retira después de preservar las capturas y los documentos necesarios.

## Alcance pendiente

Quedan la composición pública de configuración/preferencias, controles y recuperación de esas acciones, productor de grupos, intent completo de outbox, dispatcher, mantenimiento y driver operativo. La actividad conserva su control de líder; añadir su categoría no habilita el writer de configuración. No se cierra T184, T185, US8 ni T211 por este checkpoint. Los ensayos operativos, métricas y gates originales siguen independientes.
