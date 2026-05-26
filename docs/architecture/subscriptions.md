# Suscripciones por tribu

## Decisión

Las suscripciones pagas son tenant-scoped por `tribe`. Cada tribu conecta una
cuenta de Mercado Pago propia, operada por su `leader`. Los `guardian` pueden
ver la configuración de precios, pero no crear, eliminar, conectar ni cambiar
el precio actual.

## Modelo

Los precios son el catálogo operativo de planes en `tribe_subscription_prices`.
La política de modificación es destructiva sobre la misma fila local y el mismo
plan de Mercado Pago: nombre, monto, frecuencia y período de prueba se
sincronizan sobre el `mercado_pago_preapproval_plan_id` existente. Mercado Pago
congela las condiciones de cada suscripción ya emitida, por lo que editar el
template del plan no cambia lo que pagan los suscriptores existentes.

Reglas:

* puede haber varios planes activos, más baratos o más caros que otros
* solo un plan activo puede ser `current`
* nuevos integrantes ven únicamente el plan `current`
* miembros existentes conservan su suscripción de Mercado Pago aunque el plan se
  edite o elimine
* los suscriptores existentes no bloquean la eliminación local de un plan
* las invitaciones vinculadas sí bloquean la eliminación hasta que se reasignen
  o revoquen
* cada tribu puede tener hasta 30 precios activos
* `tribes.free_join_is_current` representa la opción gratuita actual; cuando
  está activa, las invitaciones aceptan ingreso gratis y no se muestra oferta
  paga para el token
* la migración de `free_join_is_current` preserva el modo efectivo anterior:
  queda `true` si no hay un precio `current` activo con plan de Mercado Pago y
  `false` si sí existe una oferta paga actual
* el período de prueba gratuita es parte mutable del precio y se sincroniza
  sobre el mismo `preapproval_plan` de Mercado Pago
* la app solo permite pruebas gratuitas expresadas en días al crear precios
  desde la UI, con un rango de 1 a 14 días

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
La clave de idempotencia de los webhooks representa la **operación de negocio**,
no el `event_id` de Mercado Pago: dos eventos distintos con efecto idéntico
comparten clave y se colapsan en una sola aplicación. Para suscripciones la
clave es `mercado-pago-webhook:<preapprovalId>:<localStatus>:<statusReason>`; para
planes es `mercado-pago-plan-webhook:<preapprovalPlanId>:<contentHash>`, donde
`contentHash` es un sha256 corto sobre los campos a los que reacciona el handler
(`status`, `reason`, `amountCents`, `currency`, `trial.frequency`,
`trial.frequencyType`). Ante colisión de clave se aplica un safeguard que
compara el estado local actual contra el estado objetivo; si difieren (caso
oscilación, ej. `authorized → paused → authorized`) se reaplica el cambio en
lugar de descartarlo. Los `event_id` de Mercado Pago no se persisten.
La pantalla de gestión no considera `Conectado` por la mera existencia de
`tribe_payment_integrations`: el health check de Mercado Pago fuerza un
refresh OAuth server-side y solo muestra `Conectado` si ese refresh persiste un
token nuevo. Si falla o no hay `refresh_token`, muestra `Requiere reconexión`.

Cuando la verificación contra Mercado Pago confirma que un
`mercado_pago_preapproval_plan_id` está pausado, el precio local se marca como
`paused`, deja de ser `current` y no acepta nuevas suscripciones hasta que
Mercado Pago vuelva a informarlo como activo. Si el plan ya no existe o queda
cancelado, el precio local se marca como `canceled`, deja de ser `current` y
conserva el identificador de plan del proveedor para reconciliar suscriptores y
webhooks posteriores.

Los planes creados por TuTribu se identifican en Mercado Pago con
`external_reference = tutribu:price:<priceId>`. La app solo sincroniza planes
que estén vinculados por ese `external_reference` o por un
`mercado_pago_preapproval_plan_id` ya persistido localmente; los planes sueltos
de la cuenta conectada se ignoran.

Cuando Mercado Pago vuelve con un `preapproval_id` desde el checkout de un
plan, el retorno del usuario no da acceso por sí mismo. La página de retorno
solo muestra el estado local y, si el `preapproval_id` todavía no está asociado,
puede consultar a Mercado Pago para vincular o recuperar una fila local
pendiente siempre que exista una operación reciente de checkout del mismo
usuario para el plan actual y el `preapproval_id` pertenezca al
`mercado_pago_preapproval_plan_id` actual de la tribu. Esa reparación conserva
la suscripción local como `pending`; la activación o remoción de acceso queda a
cargo del webhook verificado o de una reconciliación server-side posterior.

La reconciliación de suscriptores de un precio es un caso de uso reusable, no
una regla propia de la pantalla de precios. Puede dispararse desde el botón
manual, un webhook, un job periódico o una reparación puntual de admin. El
caso de uso consulta cada `mercado_pago_preapproval_id` local contra Mercado
Pago y reconcilia la base local antes de responder. `authorized`, `pending` y
`paused` siguen contando como suscripciones asociadas al precio; solo
`authorized` da acceso activo, `pending` bloquea por pago y `paused`,
`canceled`, `cancelled` o un preapproval inexistente remueven el acceso por
suscripción inactiva.

Las acciones iniciadas desde TuTribu se aplican primero contra Mercado Pago y
luego se reflejan localmente. Los webhooks `subscription_preapproval_plan`
actualizan nombre, monto y período de prueba local cuando el plan sigue activo;
pausan el precio local cuando Mercado Pago informa `paused`; y cancelan el
precio local cuando el plan proveedor deja de estar activo. La app modela el
trial con `trial_frequency` y `trial_frequency_type`, mapeados desde
`auto_recurring.free_trial.frequency` y
`auto_recurring.free_trial.frequency_type`; si Mercado Pago no devuelve
`free_trial`, el precio local queda sin período de prueba.

Una eliminación local de precio solo puede ocurrir después de que el precio ya
esté `canceled`, Mercado Pago confirme que el plan proveedor no está activo y no
queden invitaciones activas vinculadas a ese plan. Las suscripciones de miembros
se desprenden de `price_id` y conservan un snapshot mínimo del plan para que los
webhooks y la auditoría sigan funcionando sin dejar referencias al plan
eliminado.
