# Roles y permisos por comunidad

## Proposito y limites

Este documento define:

* la separacion entre autenticacion, autorizacion y permisos
* la fuente de verdad de roles por comunidad
* los roles y estados canonicos del MVP
* el reparto de responsabilidades entre Better Auth, Postgres/RLS y Next.js

No define SQL exhaustivo. Para el limite exacto de RLS, mira `docs/architecture/rls-simple.md`. Para tenancy, mira `docs/architecture/multi-tenancy.md`.

---

# Separacion de capas

## 1. Autenticacion

Responde:

**quien es el usuario**

La autenticacion la resuelve **Better Auth**. Eso incluye:

* login con Google
* sesion
* cookies de sesion
* tabla `public."user"` como identidad estable

## 2. Autorizacion

Responde:

**si ese usuario puede acceder o modificar un recurso**

La autorizacion real se resuelve con:

* `community_members`
* `community_id`
* policies de RLS
* casos de uso y servicios de aplicacion

## 3. Modelo de permisos

Responde:

**que capacidades tiene un usuario dentro de una comunidad**

La regla practica es esta:

> **Better Auth responde quien es el usuario**
> **`community_members` responde que rol y estado tiene en cada comunidad**
> **RLS decide si puede tocar los datos**
> **Next.js refleja esos permisos y orquesta acciones**

---

# Fuente de verdad

La fuente de verdad del sistema de roles por comunidad es:

* `community_members(community_id, user_id, role, status)`

Reglas fijas:

* el rol siempre esta acotado por `community_id`
* un mismo usuario puede tener roles distintos en comunidades distintas
* `profiles` no debe guardar el rol de comunidad como atributo global
* la sesion o las cookies no reemplazan la relacion `community_members`
* los roles globales no reemplazan permisos por comunidad

---

# Tipos canonicos

```ts
type CommunityRole = "owner" | "admin" | "member";
type CommunityStatus = "active" | "muted" | "blocked";
```

## Roles por comunidad

* `owner`
* `admin`
* `member`

## Estados por comunidad

* `active`
* `muted`
* `blocked`

## Permiso global para crear comunidades

En este MVP, crear comunidad se resuelve con una whitelist global:

* la capacidad de crear comunidad vive en `community_creator_whitelist`
* la whitelist se consulta por email normalizado
* la whitelist no reemplaza `owner/admin/member`
* una vez creada la comunidad, la autorizacion vuelve al modelo por `community_members`

---

# Matriz base

## `owner`

Puede:

* editar comunidad
* borrar comunidad
* crear, editar y eliminar categorias de posts
* transferir ownership
* nombrar admins
* moderar miembros
* moderar contenido dentro de su comunidad

## `admin`

Puede:

* moderar contenido dentro de su comunidad
* gestionar categorias de posts
* silenciar miembros
* bloquear miembros si la regla de negocio lo permite
* invitar o gestionar miembros si el caso de uso lo habilita

No puede:

* borrar comunidad
* cambiar owner
* transferir ownership

## `member`

Puede:

* ver comunidad
* participar segun las capacidades habilitadas
* crear o editar solo su propio contenido permitido

No puede:

* moderar miembros
* cambiar configuracion de comunidad
* gestionar categorias de posts
* reasignar roles

---

# Efecto de `status`

## `active`

Mantiene los permisos normales segun su `role`.

## `muted`

Mantiene lectura, pero pierde participacion activa.

## `blocked`

Pierde acceso tenant-scoped de lectura y escritura para esa comunidad.

---

# Responsabilidades por capa

## Better Auth

Responsable de:

* identidad del usuario
* login
* sesion
* cookies de sesion

No es responsable de:

* roles por comunidad
* permisos por comunidad

## Postgres + RLS

Responsable de:

* acceso por tenant
* ownership
* membership
* negar lecturas y escrituras cuando el usuario no cumple la policy

No es responsable de:

* toda la logica de negocio dinamica
* toda la UX del producto

## Next.js

Responsable de:

* leer el rol y estado del usuario en la comunidad actual
* ocultar o mostrar acciones en la UI
* redirigir o devolver errores de aplicacion cuando corresponde
* orquestar mutaciones con casos de uso, server actions y route handlers

Regla importante:

* ocultar un boton mejora UX, pero no concede permisos
* si RLS niega una operacion, la app no debe asumir que la UI la vuelve valida
