# Multi-tenancy por comunidades

## Decision

Esta aplicacion debe considerarse **multi-tenant**.

El tenant canonico del producto es **`community`**. La plataforma sirve a multiples comunidades independientes dentro de una misma aplicacion, y cada comunidad debe aislar:

* owner
* admins
* members
* posts
* comments
* events
* configuracion y permisos

La estrategia elegida para esta etapa es:

* **single app**
* **single database**
* **shared schema**
* tablas multi-tenant con **`community_id`**
* tabla de membresia **`community_members`**
* **RLS simple** para aislamiento por tenant y ownership
* reglas de negocio complejas en `application` y `domain`

Ese es el modelo por defecto para el producto. No se considera `course` como tenant arquitectonico.

---

# Modelo base recomendado

## Tablas nucleares

* `communities`
* `community_members`
* `posts`
* `comments`
* `events`
* `profiles`

## Claves de aislamiento

Las tablas de negocio multi-tenant deberian usar:

* `community_id` para alcance por tenant
* `user_id` o `created_by` para ownership cuando corresponda

La tabla `community_members` debe modelar la pertenencia por comunidad:

* `user_id`
* `community_id`
* `role`
* `status`

## Roles

Los detalles del sistema de roles, estados y permisos por comunidad viven en `docs/architecture/roles-and-permissions.md`.

En este documento solo fijamos la decision de tenancy:

* un usuario puede pertenecer a multiples comunidades
* esa pertenencia se modela con `community_members`
* el rol no vive como atributo global en `users` o `profiles`

---

# Auth y autorizacion

## Autenticacion

La identidad del usuario la resuelve **Supabase Auth**.

Eso incluye:

* login y sesion
* JWT y cookies de sesion
* `auth.users.id` como identificador estable del usuario
* `auth.uid()` como referencia de identidad dentro de RLS

## Autorizacion y tenancy

La pertenencia y el rol se resuelven en la aplicacion y en la base a traves de:

* `community_members`
* `community_id`
* policies de RLS
* casos de uso y servicios de aplicacion

La regla practica es esta:

> **Supabase Auth responde quien es el usuario**
> **multi-tenancy + RLS + app layer responden que puede hacer en cada comunidad**

RLS debe proteger acceso estructural a datos por tenant, membership y ownership. La app debe seguir resolviendo workflows, excepciones, reglas compuestas y decisiones de producto mas dinamicas.

Supabase Auth ayuda mucho porque entrega una identidad confiable, pero no resuelve por si solo:

* roles por comunidad
* aislamiento multi-tenant
* permisos por comunidad
* alcance por `community_id`

La fuente de verdad para eso sigue siendo `community_members` y las policies apoyadas en esa tabla. La definicion canonica del sistema de roles y permisos esta en `docs/architecture/roles-and-permissions.md`.

## JWT y custom claims

La regla base es esta:

* no usar JWT ni custom claims como fuente primaria de roles por comunidad
* no serializar la matriz completa de membresias y roles por comunidad en el token
* no usar el token como sustituto de `community_members`

Si en el futuro se usan custom claims, deben tratarse solo como una optimizacion derivada. La fuente de verdad de autorizacion sigue viviendo en la base y en la relacion `community_members(user_id, community_id, role)`.

Para el limite exacto de RLS, mira `docs/architecture/rls-simple.md`. Para la matriz de permisos y los estados de membresia, mira `docs/architecture/roles-and-permissions.md`.

---

# Que no haremos por ahora

En esta etapa no se adopta:

* `database-per-tenant`
* `schema-per-tenant`
* una instancia de Supabase por comunidad

Eso agrega costo operativo y complejidad innecesaria para el problema actual. La estrategia elegida es **multi-tenancy simple con shared schema**.

---

# Relacion con cursos

`course` puede existir como entidad de negocio dentro de una comunidad, pero **no** reemplaza al tenant arquitectonico.

La regla es:

* `community` define el limite de aislamiento
* `course` cuelga de una comunidad cuando el dominio lo necesite
* ninguna policy o decision arquitectonica debe tratar a `course` como tenant principal

Para la arquitectura general de Supabase y App Router, mira `docs/architecture/migrating-to-supabase.md`.
