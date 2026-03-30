# Multi-tenancy por comunidades

## Decision

Esta aplicacion es **multi-tenant**.

El tenant canonico del producto es **`community`**. Cada comunidad debe aislar:

* owner
* admins
* members
* posts
* comments
* events
* configuracion y permisos

La estrategia vigente es:

* **single app**
* **single database**
* **shared schema**
* tablas multi-tenant con `community_id`
* tabla de membresia `community_members`
* **RLS simple**
* reglas de negocio complejas en `application` y `domain`

No se considera `course` como tenant arquitectonico.

---

# Modelo base

## Tablas nucleares

* `user`
* `communities`
* `community_members`
* `community_creator_whitelist`
* `posts`
* `comments`
* `events`

## Claves de aislamiento

Las tablas multi-tenant deben usar:

* `community_id` para alcance por tenant
* `user_id` o `created_by` para ownership

La tabla `community_members` modela:

* `user_id`
* `community_id`
* `role`
* `status`

---

# Auth y autorizacion

## Autenticacion

La identidad del usuario la resuelve **Better Auth**.

Eso incluye:

* login y sesion
* cookies de sesion
* `public."user".id` como identificador estable

## Autorizacion y tenancy

La pertenencia y el rol se resuelven con:

* `community_members`
* `community_id`
* policies de RLS
* casos de uso y servicios de aplicacion

La regla practica es:

> **Better Auth responde quien es el usuario**
> **multi-tenancy + RLS + app layer responden que puede hacer en cada comunidad**

RLS usa contexto de request seteado por la app:

* `app.current_user_id`
* `app.current_user_email`
* `FORCE ROW LEVEL SECURITY` en tablas protegidas cuando la app entra por una conexion compartida a Postgres

La fuente de verdad sigue siendo `community_members`, no la sesion.

Antes de que exista la primera membership, la plataforma puede aplicar un permiso global de creacion:

* ese permiso vive en `community_creator_whitelist`
* las filas de esa whitelist son datos operativos del entorno

Despues de crear la comunidad:

* el usuario creador pasa a estar modelado por `community_members`
* su rol inicial queda como `owner`

---

# Que no haremos por ahora

En esta etapa no se adopta:

* `database-per-tenant`
* `schema-per-tenant`
* una instancia separada de Postgres por comunidad

La estrategia elegida sigue siendo **multi-tenancy simple con shared schema**.

---

# Relacion con cursos

`course` puede existir dentro de una comunidad, pero no reemplaza al tenant arquitectonico.

La regla es:

* `community` define el limite de aislamiento
* `course` cuelga de una comunidad cuando el dominio lo necesite
