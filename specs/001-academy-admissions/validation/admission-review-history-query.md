# Owner interno del historial de revisión

Avance de T182 sobre el código y manual guardados en `d7654587c0c525680737eb4cf45785a85b21085d`. Conserva **174 completas y 38 pendientes de 212**. Hay SQL, puertos, caso de uso, mapper, reader y factory reales; todavía no hay entrada pública ni pantalla del historial.

## Límite instalado

La migración **idx176**, `20261016013405_read_admission_review_history.sql`, agrega una consulta protegida para una solicitud explícita. Resuelve sesión y pertenencia actuales, permite líder o guardián activo y limita por tribu y recurso existentes. Un creador histórico sin pertenencia no adquiere permiso. Los límites admiten de uno a cincuenta y uno, incluido el registro adicional de continuidad; el cursor exige su tupla completa y conserva los microsegundos SQL y el identificador en orden descendente.

La función devuelve sólo los campos consumidos de cada evento. Omite metadata completa, contacto, notas, causas libres, actor interno y referencias de operaciones. Registra en la misma transacción la exposición del único recurso consultado, con su actor y versión actuales: `itemCount=1` significa una solicitud y no la cantidad de eventos. Las exposiciones usan otra familia de recursos y no contaminan la paginación del historial.

El mapper consume el contrato PostgreSQL sin validarlo mediante un schema; selecciona vocabulario propio, representa productores desconocidos como `unclassified` y estados desconocidos como ausencia de detalle. La fecha pública usa milisegundos y el cursor mantiene su valor SQL original. El DTO propio se valida después de proyectar sus campos.

`createReviewHistoryQueryModule` compone el reader y `GetAdmissionReviewHistoryUseCase` sin proveedor, keyring ni confirmación reciente de Google. El propósito existente `readReviewHistory` usa la proyección nativa de actor y recurso, evitando el lock ordinario incompatible con la lectura del guardián. El permiso de auditoría general sigue siendo exclusivo del líder. La autorización se comprueba antes y después, se rechazan eventos de otro recurso y los fallos conservan su causa privada sin convertirla en una respuesta pública.

## Reproducción y correcciones

- El primer fixture falló con **23514**. El diagnóstico identificó `guard_academy_membership_source`: se intentaban crear miembros después de activar el control de admisión. Se reordenó el bootstrap y se conservó el mismo instante de política y marcador, sin cambiar el guard.
- Otro intento falló con **42P18** al construir JSONB: los parámetros polimórficos del texto privado necesitaban cast explícito a `text`. Se corrigió el fixture.
- Con datos válidos, la ausencia real de la función se reprodujo como **42883**, antes de añadir la migración. Ese es el rojo de la consulta protegida; los fallos de preparación anteriores no lo sustituyen.
- Las suites nuevas de aplicación y mapper empezaron sin poder cargar su implementación ausente. No se contabilizan como casos ejecutados o aprobados. Después pasaron sus comportamientos de proyección, denegación, revocación, cambio de identidad/sesión y continuidad.
- La integración real reprodujo primero la factory ausente. Una repetición posterior tenía un separador de cursor incorrecto en el test: usaba el de Activity (`|`) en lugar del protocolo de revisión (`~`). Se corrigió el test y se preservó el contrato existente.
- El perfil temporal sin bypass falló con **42501** al leer la identidad nativa. El fixture no había concedido SELECT sobre las cuatro tablas consumidas por el proveedor real de cuenta. Sólo en la rama propia se concedió esa lectura y se comprobó el catálogo antes y después; el rol sigue sin BYPASSRLS ni privilegio de superusuario. No se modificaron permisos productivos.
- Una revisión propia encontró una atribución incorrecta: `actor_user_id` usa `ON DELETE SET NULL`, por lo que su ausencia no acredita una acción automática. Una regresión real de aplicación dio **nueve aprobados y uno fallido**. Ahora SQL, dominio y DTO usan `unattributed`; la integración real comprueba ese valor y conserva `account` cuando existe una referencia.

## Evidencia terminada

- **147 casos locales en cinco archivos completos**, cero fallos u omisiones: contexto, elegibilidad, revisión existente, diez casos nuevos de aplicación y tres de mapper. Las repeticiones menores no se suman. Recibo `.git/codex-t182-review-history-focused-current.json`.
- La primera validación SQL pasó **un caso Native completo**, sin filtros, sobre el artifact real y ambos roles de ejecución. Comprueba scope, límite, tuplas con fechas iguales y microsegundos, exclusión de campos privados, ocho exposiciones originales, pérdida de rol/sesión y ausencia de comandos, entregas o cambios de solicitudes. Su manifiesto precede al ajuste de atribución y a la preparación ampliada de identidad; se conserva como cohorte histórica, no como una prueba nueva de la versión final.
- La integración final del artifact y la factory pasó **un caso Native completo**, cero fallos u omisiones, con **2038 inputs estables**. Usa cuentas y sesiones reales del fixture y ejecutores runtime/non_bypass, valida líder y guardián, legado minimizado, cursor exacto, scope cruzado, un historial autorizado vacío, rechazo de no miembros y revocación actual. Comprueba también que la exposición almacenada pertenece a la cuenta que consultó. Recibos `.git/codex-t182-review-history-module-actor-current-{target,outcome}.json`.
- Tipos de producto y tests y lint focal aprobaron. El build aislado real pasó con **1784 archivos de producto**, **2045 del overlay** y **54/54 páginas**, con fuentes estables. El overlay incluye las migraciones y el journal actuales; se reutilizó únicamente el checkout propio sin archivos de entorno privados.
- La arquitectura pasó **cuatro vistas y veinticuatro regiones**, en Chromium/WebKit a 390/1280, sin desbordes o errores y con hash estable. La conciliación oficial posterior confirmó cero ramas temporales propias, conservando producción, el piloto y la rama ajena.

La revisión y el workflow de este nuevo checkpoint conservan sus recibos propios. El CI del padre `d7654587` ya terminó con 526 archivos y 5503 casos aprobados, 282 archivos y 816 casos omitidos y 54 páginas, y no se atribuye al owner posterior. La ruta, el recorrido visible y sus pruebas/manuales siguen pendientes; ningún checkbox ni gate se cierra por este incremento interno. No hubo envíos externos ni migraciones productivas.
