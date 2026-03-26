# RLS simple

## Que significa

RLS simple no significa una policy trivial. Significa usar **Row Level Security** para resolver **seguridad estructural de acceso a datos**, sin convertirla en el motor completo de reglas de negocio del producto.

La idea practica es esta:

> **RLS para seguridad de acceso a datos**
> **App layer para logica de negocio compleja**

Ese suele ser el punto de equilibrio correcto en Supabase, sobre todo para un MVP. ([Supabase][1], [Supabase][3])

Para la decision de tenancy de este producto, mira tambien `docs/architecture/multi-tenancy.md`.
Para el sistema de roles y permisos por comunidad, mira `docs/architecture/roles-and-permissions.md`.

---

# Por que da valor real desde el MVP

Supabase recomienda RLS como mecanismo principal de autorizacion a nivel aplicacion y la presenta como **defense in depth**. Eso significa que, aunque alguien llegue a la API o a una integracion fuera de la UI, la base sigue aplicando restricciones de acceso. ([Supabase][1], [Supabase][2])

O sea:

* no es un lujo
* no es una optimizacion para despues
* es parte de la linea base de seguridad

En un MVP eso ya te resuelve algo importante:

* menos checks duplicados en server actions y route handlers
* menos riesgo de olvidarte permisos en algun endpoint
* menos bugs donde el frontend oculta algo, pero la API igual lo permite

---

# Que tipo de acoplamiento introduce

Si dejas RLS simple, te acoplas a:

* Postgres
* el modelo de auth y JWT
* policies de acceso a datos

Pero no te acoplas tanto a una maraña de reglas de producto metidas en SQL.

Ese matiz importa porque RLS es una primitive de **Postgres**, no algo exclusivo de Supabase. El acople fuerte no es tanto "a Supabase" como al enfoque de **authorization in the database**. ([Supabase][1], [Supabase][3])

## Por que ese acoplamiento suele convenir

Porque te da:

* seguridad por defecto mas robusta
* integracion natural con Supabase Auth
* proteccion incluso si alguien pega directo a la API
* menos dependencia de checks dispersos por la app

Supabase Auth esta pensado para integrarse con RLS, y los tokens de acceso del usuario se usan justamente para restringir acceso a datos y endpoints. ([Supabase][3])

En este proyecto eso significa que RLS consume identidad desde Auth, pero no delega en Auth la modelacion de membership o roles por comunidad.

---

# Que meteria en RLS

## Casos adecuados

* ownership por `user_id = auth.uid()`
* acceso por pertenencia a `community_id`
* acceso via `community_members`
* acceso por rol simple definido en `docs/architecture/roles-and-permissions.md`
* lectura y escritura sobre filas del propio usuario
* acceso por tenant o comunidad cuando la regla es clara

La regla importante es esta:

* `auth.uid()` identifica al usuario actual
* `community_members` resuelve su pertenencia y rol
* JWT y custom claims no reemplazan esa relacion como fuente de verdad

La matriz exacta de capacidades por `role` y el efecto de `status` no viven en este documento. Ese detalle esta separado en `docs/architecture/roles-and-permissions.md`.

## Ejemplos de academia online

* un usuario solo ve su `profile`
* un autor solo puede editar sus posts
* un usuario solo borra sus propios comentarios
* un miembro solo ve comunidades a las que pertenece
* un miembro solo ve posts y eventos de comunidades donde tiene membresia
* un rol de moderacion puede operar dentro de su comunidad cuando la policy lo permite
* un alumno ve sus inscripciones
* un usuario solo ve sus datos privados

Eso sigue siendo RLS simple porque responde preguntas claras de:

* ownership
* membership
* rol simple
* alcance por tenant o comunidad

---

# Que dejaria fuera de RLS

No meteria en RLS:

* workflows complejos
* reglas de negocio cambiantes
* flujos de aprobacion
* reglas temporales enmarañadas
* visibilidad muy dinamica
* permisos compuestos con muchas excepciones
* validaciones de UX o de producto
* limites comerciales o de plan
* automatizaciones y procesos de negocio

Eso conviene resolverlo en casos de uso o servicios de aplicacion.

## Modelo mental util

RLS responde:

**"este usuario puede tocar esta fila?"**

La app responde:

**"tiene sentido de negocio permitir esta accion ahora?"**

Si mezclas ambas preguntas dentro de RLS, la cosa se vuelve mucho mas dificil de mantener.

Tambien se vuelve mas fragil si intentas meter en el token toda la matriz de roles por comunidad. Para este producto, ese modelo no es la base recomendada.

---

# Mantenibilidad y performance

Dejar RLS basica mejora mucho la mantenibilidad:

* es mas facil auditar policies
* es mas facil testearlas
* es mas facil entender por que algo falla
* es menos probable que una regla de negocio rompa media app

Cuando las policies empiezan a decidir estados editoriales raros, aprobaciones o permisos con muchas excepciones, la maintainability cae rapido.

Tambien hay un costo de performance si las policies estan mal diseñadas. Supabase tiene una guia especifica para eso y recomienda, por ejemplo, indexar columnas usadas en policies porque el impacto puede ser grande en tablas voluminosas. ([Supabase][4])

---

# Recomendacion final

Para este proyecto:

## Si conviene usar RLS desde el principio

Pero asi:

* **RLS fuerte para acceso a datos**
* **simple y entendible**
* **basada en ownership, membership, tenant scope y rol**
* **sin convertirla en motor completo de negocio**

Eso te da:

* seguridad real desde el MVP
* menos bugs de permisos
* buen encaje con Supabase Auth
* acoplamiento aceptable
* portabilidad razonable, porque sigues en Postgres

Y ademas deja clara la frontera:

* Auth para identidad
* `community_members` para membresia y roles
* RLS para aislamiento estructural

## En una frase

**Si, acoplarte un poco a RLS vale la pena; acoplarte mucho, no.**

Para complementar esta definicion dentro de la arquitectura general, mira `docs/architecture/migrating-to-supabase.md`, `docs/architecture/multi-tenancy.md` y `docs/architecture/roles-and-permissions.md`.

[1]: https://supabase.com/docs/guides/database/postgres/row-level-security?utm_source=chatgpt.com "Row Level Security | Supabase Docs"
[2]: https://supabase.com/docs/guides/deployment/going-into-prod?utm_source=chatgpt.com "Production Checklist | Supabase Docs"
[3]: https://supabase.com/docs/guides/auth?utm_source=chatgpt.com "Auth | Supabase Docs"
[4]: https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv?utm_source=chatgpt.com "RLS Performance and Best Practices"
