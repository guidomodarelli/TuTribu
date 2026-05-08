# Suscripciones por tribu

## Decisión

Las suscripciones pagas son tenant-scoped por `tribe`. Cada tribu conecta una
cuenta de Mercado Pago propia, operada por su `leader`. Los `guardian` pueden
ver la configuración de precios, pero no crear, eliminar, conectar ni cambiar
el precio actual.

## Modelo

Los precios son versiones históricas inmutables en
`tribe_subscription_prices`. No se editan; un cambio crea una nueva versión y
el líder puede marcar una versión como `current`.

Reglas:

* puede haber precios nuevos más baratos que los anteriores
* solo una versión activa puede ser `current`
* nuevos integrantes ven únicamente la versión `current`
* miembros existentes conservan su `price_id` original
* no se elimina una versión con miembros asociados
* cada tribu puede tener hasta 30 precios activos

## Estado de acceso

`tribe_members.status = blocked` sigue siendo el efecto de autorización para
negar acceso. La causa de bloqueo por pago vive en
`tribe_member_subscriptions.status_reason = payment_blocked`, lo que permite
distinguirla de un bloqueo por conducta.

Un usuario bloqueado por pago puede iniciar un nuevo checkout con el precio
actual de la tribu. Un usuario bloqueado por conducta no puede reingresar por
el flujo de pago.

## Mercado Pago

La integración guarda tokens OAuth solo del lado servidor en
`tribe_payment_integrations`. Las operaciones externas usan claves de
idempotencia y los webhooks se registran en
`subscription_idempotency_operations` para evitar efectos duplicados.

Cuando la verificación contra Mercado Pago confirma que un
`mercado_pago_preapproval_plan_id` ya no existe o no está activo, el precio
local se marca como `canceled`, deja de ser `current` y se limpia el
identificador de plan del proveedor. Esa transición es irreversible: los
precios cancelados no vuelven a consultarse en Mercado Pago ni pueden
reactivarse; cualquier nueva oferta debe crear una nueva versión de precio y
un nuevo plan de proveedor.
