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

## Roles

Los roles soportados a nivel arquitectura son:

* `owner`
* `admin`
* `member`

Un mismo usuario puede tener roles distintos en comunidades distintas. El rol no debe vivir como atributo global en `users` o `profiles`.

---

# Auth y autorizacion

## Autenticacion

La identidad del usuario la resuelve **Supabase Auth**.

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

Para el limite exacto de RLS, mira `docs/architecture/rls-simple.md`.

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
