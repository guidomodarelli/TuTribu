# Design System

This document is a plain-text design system for AI agents generating UI in this
repository. Read it before creating or changing screens, components, layouts,
states, or user-facing interaction patterns.

## Product Feel

TuTribu should feel calm, focused, and useful. The interface should help
people understand where they are, what they can do next, and what changed after
an action.

Prefer operational product UI over marketing-style composition:

- Clear page hierarchy.
- Simple layouts with enough whitespace.
- Direct actions near the content they affect.
- Spanish user-facing text.
- No decorative clutter.

## Cards Policy

Do not use Cards unless the user explicitly asks for cards.

This applies to:

- `Card`, `CardHeader`, `CardContent`, and related `shadcn/ui` Card components.
- Custom card-like wrappers with borders, elevated backgrounds, shadows, or
  framed sections.
- Page sections styled as floating containers.

Use cards only when the user directly requests them or when maintaining an
existing card requested by the user. If a grouped area is needed, prefer plain
semantic structure such as `section`, `header`, `div`, `dl`, `ul`, or `form`
with restrained spacing and typography.

## Component Library

Use `beez-ui` as the shared component library. Group named imports from the
package root, for example `import { Button, Dialog, Input } from "beez-ui"`.
The library owns the shadcn/ui sources and all shared customizations. Add new
upstream components with the official CLI in the `beez-ui` repository, then
version and distribute the package. Do not run the shadcn CLI in this app or
reintroduce local copies under `components/ui`.

Compose shared components with product SCSS Modules. The library provides the LaTribu palette and fonts by default. Keep page-specific
styles and explicit overrides in this repository. Import shared component
styles once through `beez-ui/styles.css`. Follow the integration contract in
`docs/architecture/shared-ui-library.htm`.

Only create a product-specific custom component when the shared library has
no suitable composition. Custom components must respect the visual language,
spacing, tokens, interaction patterns and SCSS Module conventions.

## Layout

- Use the page itself as the main surface.
- Prefer full-width sections with constrained inner content when a layout needs
  readable measure.
- Keep repeated content scannable with lists, rows, tables, or definition lists.
- Avoid putting UI containers inside other UI containers.
- Keep empty states quiet and action-oriented.

## Typography

- The product ships two self-hosted typefaces (latin WOFF2 in `app/fonts`,
  loaded with `next/font/local`, never fetched from Google at runtime):
  - **Geist** (weights 400-600) is the base sans for everything: body copy,
    controls, labels, badges, and ordinary headings. It is exposed through the
    `--font-sans` and `--font-heading` tokens and matches the shadcn/ui feel.
  - **Poppins** (weight 600) is reserved exclusively for large page-level
    display headings, exposed through the `--font-display` token. Do not use it
    for body text, controls, or compact headings.
- Use large type only for true page-level headings.
- Keep compact panels, forms, sidebars, and tool surfaces visually dense enough
  for repeated use.
- Avoid negative letter spacing.
- Keep labels short and specific.

## Interaction

- Use familiar controls for their intended purpose:
  - Buttons for commands.
  - Links for navigation.
  - Inputs, selects, checkboxes, switches, and sliders for forms.
  - Lists, tables, or definition lists for structured information.
- Critical actions must show clear disabled, loading, success, and error states.
- Validation feedback must be visible near the affected input or action.

## Styling

- Product styles use SCSS Modules.
- Product classes follow BEM.
- Avoid inline styles except for rare runtime-only values.
- Keep colors tied to project tokens and CSS variables when available.
- Avoid one-note palettes and decorative gradient/orb backgrounds.

## Accessibility

- Use semantic HTML first.
- Preserve heading order.
- Add `aria-*` only when semantics need extra clarification.
- Do not hide important status, error, or validation feedback from assistive
  technology.
- Ensure text remains readable and does not overlap at mobile and desktop sizes.

## Content

- User-facing text must be in Spanish.
- Technical identifiers in code stay in English.
- Avoid filler copy. If content is temporary, prefer a small empty state or leave
  the space empty until there is real product behavior to show.
