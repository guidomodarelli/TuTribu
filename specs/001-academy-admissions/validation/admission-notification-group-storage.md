# Persistencia privada de grupos de admisión

Este incremento añade almacenamiento versionado al modelo privado guardado en 1881202d. Conserva las 212 tareas originales: 174 completas y 38 pendientes. T180, T181, T185 y US8 mantienen su alcance completo; la aprobación expresa de la checklist temática está registrada por separado en 8827c805.

## Contrato implementado

- SQL y Drizzle modelan grupos por cuenta, tribu, audiencia, modo, versiones de preferencia y habilitación, zona y ventana. La fuente individual forma parte de la identidad cuando corresponde. La restricción única trata los valores nulos como iguales.
- Cada obligación/destinatario/audiencia tiene un solo miembro lógico, incluso entre grupos o ventanas. Las claves foráneas compuestas impiden cruzar fuentes o destinatarios entre ámbitos. El miembro exige un aviso interno propio y conserva el vencimiento original del evento más veinticuatro horas.
- Los grupos abiertos admiten recuperación de su ventana original; el productor conserva la responsabilidad de asignar hechos nuevos a ventanas actuales y revalidar autoridad. El cierre incrementa la versión y fija la identidad y los datos resultantes. Un grupo cerrado no acepta miembros nuevos.
- El guard de congelamiento usa el reloj real después de tomar locks, selecciona fuentes vigentes, reconstruye el manifest mínimo ordenado y exige su igualdad exacta y el menor plazo original. Los vencidos conservan un resultado explícito. Un no-op mantiene los valores; el constraint trigger diferido impide confirmar un miembro incluido sin su grupo congelado.
- Ambas tablas tienen RLS activada y forzada, policies privadas del owner y privilegios públicos revocados. Los tres guards son SECURITY DEFINER con search_path fijo y sin EXECUTE público. No hay rutas, repositorio productor ni permiso de envío derivados de esta estructura.

## Validación actual

El primer intento focal no pudo crear los grupos: la causa PostgreSQL observada fue **42P01**, tabla inexistente después de preparar el journal original. Conserva cero aprobados, un fallo y dos casos fuera del filtro. La versión previa de los tres casos terminó aprobada, pero no incluía todas las comprobaciones negativas añadidas después; no se suma como evidencia de la versión actual.

La repetición actual completa terminó el **2026-10-15T15:47:41.094Z**, con **tres casos aprobados, cero fallos y cero filtrados**, y los quince inputs registrados estables. Los escenarios ejercitan:

1. Inserción concurrente con un único ganador, repetición del miembro entre ventanas, claves foráneas de ámbito y unicidad del recordatorio original sobre una solicitud pendiente de más de tres días. Un miembro incluido se observa dentro de la transacción; el constraint diferido rechaza el commit y la lectura posterior confirma su restauración a pendiente.
2. Rechazo de un manifest inicial con un campo añadido y de una extensión de un microsegundo. Se observa el grupo congelado dentro de una transacción que luego se aborta, y la cabecera original restaurada después. El cierre confirmado selecciona solo la fuente vigente, conserva el vencimiento exacto mediante la proyección Drizzle, resuelve la vencida, rechaza cambios posteriores y preserva el no-op.
3. Vencimiento terminal explícito sin manifest ni plazo de entrega; lectura e inserción denegadas a roles de request aun con grants adversos, sin conceder membresía al solicitante. El catálogo real confirma ENABLE/FORCE RLS en ambas tablas y la configuración efectiva de los tres guards.

Son tres casos completos de un archivo; las aserciones internas y las repeticiones no se cuentan como casos adicionales. Se ejecutan el journal versionado, pg y Drizzle reales, sin dobles de esos componentes ni del repositorio. No se deshabilitan guardas, no se reescriben fechas persistidas y no se envían mensajes externos.

La conciliación oficial posterior del **2026-10-15T15:48:47.843Z** confirmó producción y el piloto original, con cero ramas temporales. Lint focal y tipos de pruebas de las fuentes mejoradas pasaron; los tipos de producto ya pasaron sobre el mismo código productivo. La sección de arquitectura se comprobó en cuatro vistas reales de Chromium/WebKit a 390 y 1280 px, sin overflow y con su enlace local disponible; se inspeccionaron visualmente Chromium de escritorio y WebKit móvil. La evidencia sanitizada se registra en [admission-notification-group-storage-results.json](admission-notification-group-storage-results.json).

## Alcance restante

El almacenamiento contiene referencias mínimas y sus invariantes; faltan el repositorio productor y su integración con obligaciones, el recordatorio automático con avisos/auditoría atómicos, el destinatario confiable actual, el intent completo sellado de outbox, recuperación y retención, habilitación de correo, API/UI y despacho. El futuro productor deberá respetar el orden canónico de locks y revalidar hechos actuales; el manifest por sí solo no autoriza enviar.

El [CI completo de 8827c805](https://github.com/guidomodarelli/TuTribu/actions/runs/38758622861) aprobó 5308 casos y el build real de 53 páginas. Corresponde a la base guardada anterior y no certifica esta edición posterior. El siguiente commit conservará su propio control completo. No se acreditan todavía los seis AC de US8, SC-015, T211 ni los gates operativos pendientes.
