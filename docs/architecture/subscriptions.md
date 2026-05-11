# Suscripciones por tribu

## Decisión

Las suscripciones pagas son tenant-scoped por `tribe`. Cada tribu conecta una
cuenta de Mercado Pago propia, operada por su `leader`. Los `guardian` pueden
ver la configuración de precios, pero no crear, eliminar, conectar ni cambiar
el precio actual.

## Modelo

Los precios son versiones históricas en `tribe_subscription_prices`. La política
de modificación es mixta: el nombre y el estado del plan se sincronizan sobre el
mismo precio y el mismo plan de Mercado Pago; los cambios de monto o frecuencia
crean una nueva versión y un nuevo plan de proveedor.

Reglas:

* puede haber precios nuevos más baratos que los anteriores
* solo una versión activa puede ser `current`
* nuevos integrantes ven únicamente la versión `current`
* miembros existentes conservan su `price_id` original
* no se cancela una versión con miembros asociados
* cada tribu puede tener hasta 30 precios activos

## Estado de acceso

`tribe_members.status = blocked` se reserva para bloqueos recuperables del
checkout pendiente o para bloqueos de conducta. Cuando Mercado Pago confirma
que una suscripción vigente dejó de estar activa, la membresía se conserva como
historial con `tribe_members.status = removed` y
`tribe_members.status_reason = subscription_inactive`.

Un usuario bloqueado por pago puede iniciar un nuevo checkout con el precio
actual de la tribu. Un usuario bloqueado por conducta no puede reingresar por
el flujo de pago. Una membresía `removed/subscription_inactive` no tiene acceso
ni aparece como miembro visible; puede conservarse para auditoría, webhooks y
reconciliación.

## Mercado Pago

La integración guarda tokens OAuth solo del lado servidor en
`tribe_payment_integrations`. Las operaciones externas usan claves de
idempotencia y los webhooks se registran en
`subscription_idempotency_operations` para evitar efectos duplicados.

Cuando la verificación contra Mercado Pago confirma que un
`mercado_pago_preapproval_plan_id` ya no existe o no está activo, el precio
local se marca como `canceled`, deja de ser `current` y conserva el
identificador de plan del proveedor. Esa transición es irreversible para la
oferta local: cualquier nueva oferta debe crear una nueva versión de precio y
un nuevo plan de proveedor, pero el identificador se preserva para poder
reconciliar suscriptores y webhooks posteriores.

Los planes creados por LaTribu se identifican en Mercado Pago con
`external_reference = latribu:price:<priceId>`. La app solo sincroniza planes
que estén vinculados por ese `external_reference` o por un
`mercado_pago_preapproval_plan_id` ya persistido localmente; los planes sueltos
de la cuenta conectada se ignoran.

Cuando Mercado Pago vuelve con un `preapproval_id` desde el checkout de un
plan, la app confirma el retorno contra la API del proveedor antes de dar
acceso. Si la reserva local pendiente no quedó asociada pero existe una
operación reciente de checkout del mismo usuario para el plan actual, el retorno
puede recuperar la fila local de suscripción siempre que el `preapproval_id`
pertenezca al `mercado_pago_preapproval_plan_id` actual de la tribu.

La verificación manual de suscriptores de un precio consulta cada
`mercado_pago_preapproval_id` local contra Mercado Pago y reconcilia la base
local antes de responder. `authorized`, `pending` y `paused` siguen contando
como suscripciones asociadas al precio; solo `authorized` da acceso activo,
`pending` bloquea por pago y `paused`, `canceled`, `cancelled` o un
preapproval inexistente remueven el acceso por suscripción inactiva.

Las acciones iniciadas desde LaTribu se aplican primero contra Mercado Pago y
luego se reflejan localmente. Los webhooks `subscription_preapproval_plan`
actualizan el nombre local cuando el plan sigue activo y cancelan el precio
local cuando el plan proveedor deja de estar activo.

Una eliminación local de precio solo puede ocurrir después de que el precio ya
esté `canceled`, Mercado Pago confirme que el plan proveedor no está activo y
no haya suscripciones activas asociadas ni en Mercado Pago ni en la base local.
