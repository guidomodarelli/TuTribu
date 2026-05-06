# Roles y permisos por tribu

## Proposito y limites

Este documento define:

* la separacion entre autenticacion, autorizacion y permisos
* la fuente de verdad de roles por tribu
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

* `tribe_members`
* `tribe_id`
* policies de RLS
* casos de uso y servicios de aplicacion

## 3. Modelo de permisos

Responde:

**que capacidades tiene un usuario dentro de una tribu**

La regla practica es esta:

> **Better Auth responde quien es el usuario**
> **`tribe_members` responde que rol y estado tiene en cada tribu**
> **RLS decide si puede tocar los datos**
> **Next.js refleja esos permisos y orquesta acciones**

---

# Fuente de verdad

La fuente de verdad del sistema de roles por tribu es:

* `tribe_members(tribe_id, user_id, role, status)`

Reglas fijas:

* el rol siempre esta acotado por `tribe_id`
* un mismo usuario puede tener roles distintos en tribus distintas
* `profiles` no debe guardar el rol de tribu como atributo global
* la sesion o las cookies no reemplazan la relacion `tribe_members`
* los roles globales no reemplazan permisos por tribu

---

# Tipos canonicos

```ts
type TribeRole = "owner" | "admin" | "member";
type TribeStatus = "active" | "muted" | "blocked";
```

## Roles por tribu

* `owner`
* `admin`
* `member`

## Estados por tribu

* `active`
* `muted`
* `blocked`

## Permiso global para crear tribus

En este MVP, crear tribu se resuelve con una whitelist global:

* la capacidad de crear tribu vive en `tribe_creator_whitelist`
* la whitelist se consulta por email normalizado
* la whitelist no reemplaza `owner/admin/member`
* una vez creada la tribu, la autorizacion vuelve al modelo por `tribe_members`

---

# Matriz base

## `owner`

Puede:

* editar tribu
* borrar tribu
* crear, editar y eliminar categorias de posts
* transferir ownership
* nombrar admins
* moderar miembros
* moderar contenido dentro de su tribu

## `admin`

Puede:

* moderar contenido dentro de su tribu
* gestionar categorias de posts
* silenciar miembros
* bloquear miembros si la regla de negocio lo permite
* invitar o gestionar miembros si el caso de uso lo habilita

No puede:

* borrar tribu
* cambiar owner
* transferir ownership

## `member`

Puede:

* ver tribu
* participar segun las capacidades habilitadas
* crear o editar solo su propio contenido permitido

No puede:

* moderar miembros
* cambiar configuracion de tribu
* gestionar categorias de posts
* reasignar roles

---

# Efecto de `status`

## `active`

Mantiene los permisos normales segun su `role`.

## `muted`

Mantiene lectura, pero pierde participacion activa.

## `blocked`

Pierde acceso tenant-scoped de lectura y escritura para esa tribu.

---

# Responsabilidades por capa

## Better Auth

Responsable de:

* identidad del usuario
* login
* sesion
* cookies de sesion

No es responsable de:

* roles por tribu
* permisos por tribu

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

* leer el rol y estado del usuario en la tribu actual
* ocultar o mostrar acciones en la UI
* redirigir o devolver errores de aplicacion cuando corresponde
* orquestar mutaciones con casos de uso, server actions y route handlers

Regla importante:

* ocultar un boton mejora UX, pero no concede permisos
* si RLS niega una operacion, la app no debe asumir que la UI la vuelve valida
