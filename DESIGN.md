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

Compose shared components with product SCSS Modules. The library ships the [Arc](https://uiarc.dev) foundation:
semantic color roles (`--surface`, `--surface-muted`, `--text-secondary`, `--text-muted`, `--border`,
`--border-strong`, `--danger`…), concentric radii (`--radius-control` 18px, `--radius-panel` 26px,
`--radius-surface` 34px), control heights (`--control-height-sm|md|lg`), shadows, easing and a keyboard-only focus
outline, in light and dark, with Arc's blue accent. Style product code with those tokens; the shadcn names
(`--primary`, `--muted`, `--muted-foreground`…) remain as aliases, and `--accent` is Arc's brand accent, not a hover
grey. Keep page-specific
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

- The product follows Arc's typography with two self-hosted typefaces (latin
  WOFF2 in `app/fonts`, loaded with `next/font/local`, never fetched from Google
  at runtime):
  - **Inter** (weights 400-500) is the base sans for body copy, controls,
    labels, badges, and compact headings, exposed through `--font-sans` and
    `--font-body`.
  - **Geist** (weights 400-500) is reserved for page-level display headings of
    30px and up, exposed through `--font-display` and `--font-heading`.
- Use only weights 400 and 500. Never 600 or bold: hierarchy comes from size,
  color (`--foreground` over `--text-secondary`) and spacing.
- No `text-transform: uppercase` and no wide letter spacing on small labels.
- Use large type only for true page-level headings.
- Keep compact panels, forms, sidebars, and tool surfaces visually dense enough
  for repeated use.
- Keep labels short and specific.

## Interaction

- Use familiar controls for their intended purpose:
  - Buttons for commands.
  - Links for navigation.
  - Inputs, selects, checkboxes, switches, and sliders for forms.
  - Lists, tables, or definition lists for structured information.
- Critical actions must show clear disabled, loading, success, and error states.

## Buttons and action links

- Use `Button` from beez-ui for actions. It follows Arc's API: `variant`
  `primary` (one per surface), `secondary`, `ghost` or `danger`; `size` `sm`,
  `md` (default) or `lg`; and `loading` for short async work. It defaults to
  `type="button"`; pass `type="submit"` to submit a form.
- Icon-only buttons use `size="sm"` and need an `aria-label` or visually hidden
  text.
- `Button` has no `asChild`. A navigation that should look like a button stays a
  `Link` (or `<a>`, or a `<label>` wrapping a file input) and takes the Arc look
  in its SCSS Module through the shared mixin:
  `@use "…/src/styles/action-link";` and
  `@include action-link.action-link(secondary, sm);`.
- Radix triggers still compose with `asChild` on the trigger:
  `<DialogTrigger asChild><Button>…</Button></DialogTrigger>`.
- Validation feedback must be visible near the affected input or action.

## Form fields

- Use `Input` and `Textarea` from beez-ui; they follow Arc's Input and
  Textarea (44px controls, 110px textareas with vertical resize, border-only
  focus, `danger` border when invalid).
- For a labelled field, pass `label`, plus `description` for helper copy and
  `error` for validation copy, instead of composing a separate `<label>`, hint
  and error paragraph. The component ties them to the control through
  `htmlFor`, `aria-describedby` and `aria-invalid`, announces the error with
  `role="alert"`, and animates the rows and changed words (counts roll only the
  digits that change) with a reduced-motion branch.
- Pass `error` (and `description`) even when it is `undefined`: the field mode
  depends on which props are present, so the control never remounts when
  validation appears.
- Without `label`, `description` or `error` the components render the bare
  control, for input groups, tables and layouts that place their own label.

## Dialogs and badges

- `Dialog` and `AlertDialog` own Arc's surface: the dimmed, blurred overlay,
  the raised panel with a 24px padding and a 440px maximum width, and a
  `DialogFooter` that bleeds to the panel edges under its own hairline, tint
  and padding. Do not restyle the overlay, and do not add a border, background
  or padding to `DialogFooter` or override the panel padding when a footer is
  present.
- Rows inside a dialog that must read as part of the panel, such as a sticky
  header or a toolbar, paint the panel's `--surface-raised`, never
  `--background`, which is a darker tone in dark mode.
- `Badge` is 26px tall (22px with `size="sm"`). Pick its color with `tone`
  (`neutral`, `success`, `info`, `warning`, `danger`) or the tone its `variant`
  implies, instead of overriding height, border or text color, and do not
  re-animate it.

## Notifications

- Notifications use `toast` and `ThemedToaster` from beez-ui, mounted once in
  `components/providers/app-providers`. Do not mount the raw `Toaster` and do
  not restyle toasts: their surface, icons and theme come from beez-ui, and
  their buttons stay usable, also with the keyboard (Alt+T), while a dialog
  is open.

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
