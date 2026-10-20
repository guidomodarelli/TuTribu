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

- @golfo/ui's `Card` (Arc's content card with `title`, `description`, `media`,
  `footer` and quick look).
- Custom card-like wrappers with borders, elevated backgrounds, shadows, or
  framed sections.
- Page sections styled as floating containers.

Use cards only when the user directly requests them or when maintaining an
existing card requested by the user. If a grouped area is needed, prefer plain
semantic structure such as `section`, `header`, `div`, `dl`, `ul`, or `form`
with restrained spacing and typography.

## Component Library

Use `@golfo/ui` as the shared component library. Group named imports from the
package root, for example `import { Button, Dialog, Input } from "@golfo/ui"`.
The library owns the shadcn/ui sources and all shared customizations. Add new
upstream components with the official CLI in the `@golfo/ui` repository, then
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
styles once through `@golfo/ui/styles.css`. Follow the integration contract in
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

- Use `Button` from @golfo/ui for actions. It follows Arc's API: `variant`
  `primary` (one per surface), `secondary`, `ghost` or `danger`; `size` `sm`,
  `md` (default) or `lg`; and `loading` for short async work. It defaults to
  `type="button"`; pass `type="submit"` to submit a form.
- Icon-only buttons use `size="sm"` and need an `aria-label` or visually hidden
  text.
- `Button` has no `asChild`. An in-app navigation that should look like a
  button is a `ButtonLink` from `@/components/navigation/link`, with the same
  `variant` and `size`: `<ButtonLink href={ROUTES.home} variant="secondary">`.
  It is the shared `Link`, so it keeps the provider's routing and `prefetch`
  default.
- An external `<a>`, a download or a `<label>` wrapping a file input takes the
  same classes with `buttonClassName({ variant, size, className })` from
  @golfo/ui; it also runs in Server Components. The BEM class passed as
  `className` keeps only layout (margins, width, flex).
- Neither includes the press scale or the loading spinner of `Button`.
- Radix triggers still compose with `asChild` on the trigger:
  `<DialogTrigger asChild><Button>…</Button></DialogTrigger>`.
- Validation feedback must be visible near the affected input or action.

## Form fields

- Use `Input` and `Textarea` from @golfo/ui; they follow Arc's Input and
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

- `Dialog` (also in its `alert` mode, which replaces `AlertDialog`) owns
  Arc's surface: the dimmed, blurred overlay, the raised panel with a 24px
  padding and a 440px maximum width, the header that `DialogContent` draws
  from `title` and `description`, its close button ("Cerrar diálogo"), and the
  `footer` that bleeds to the panel edges under its own hairline, tint and
  padding. Do not restyle the overlay, and do not add a border, background or
  padding to the footer (`footerClassName`) or override the panel padding when
  a footer is present.
- Dialog actions go in `footer`. When they submit a form in the body, give the
  form an `id` and the submit button `form={id}`, so Enter in a field still
  submits it. Confirmations use `<Dialog alert>` with a `DialogClose asChild`
  cancel button, which receives the focus when the dialog opens.
- Header extras such as type or status badges go in `headerContent`, which
  renders them between the title and the description without changing the
  dialog's accessible name. Keep the built-in close button; to open a dialog
  with the focus on it, pass `closeButtonRef` and focus it from
  `onOpenAutoFocus` instead of drawing a custom close control.
- Rows inside a dialog that must read as part of the panel, such as a sticky
  header or a toolbar, paint the panel's `--surface-raised`, never
  `--background`, which is a darker tone in dark mode.
- `Badge` is 26px tall (22px with `size="sm"`). Pick its color with `tone`
  (`neutral`, the default, `success`, `info`, `warning`, `danger`) and pass a
  leading icon through `icon`, instead of overriding height, border or text
  color, and do not re-animate it.
- Choice fields use `Select` with its own `label` (the same field label as
  `Input`) and `options`; use `hideLabel` only when the layout already shows
  that text, never next to an external `<label>` for the same trigger, which
  would announce the name twice.

## Section workspaces

Use this pattern for a family of related pages that share one subject (for
example the academy admission pages: requests, rules, allowlist, invitations,
messaging, notices and activity).

- Put the shared frame in the family's `layout.tsx`: a quiet return link, the
  page `h1` with a one-line description, and a row of sibling sections where
  the current page carries `aria-current="page"` and a raised highlight that
  glides to the new section. The frame stays mounted across sibling pages, so
  only the content shows its loading skeleton. Layouts never read route params
  on the server: the frame resolves the page on the client. Filter the row by
  the member's role, as the app rail does; the server authorizes each page.
- Content revealed after a client-side check uses the skeleton morph, so the
  placeholders become the content instead of swapping for it.
- Mirror the same family in the app rail as one disclosure group under its
  heading; the group opens by itself on any of its pages.
- Inside a page, separate blocks with a hairline and a 20px `h2`; start with a
  compact summary of the current state (badges or labeled facts) before forms.
- Lists use hairline rows: a medium-weight title, status badges and one quiet
  meta line, with the row action on the trailing edge.
- Group consent and actions at the end of the block they confirm, primary
  first; recovery goes in a callout with a colored rule.
- Share rhythm through `src/styles/_workspace-panel.scss` instead of local copies.
- When a family needs setup before it works, the landing page shows a setup
  guide (`components/academy-admissions/admission-setup-guide`): ordered steps
  derived from server state, required versus optional, a quiet progress bar and
  one primary link to the next step. Hide it once nothing is left.

## Guided settings and write feedback

- Settings that take several decisions use `components/forms/guided-steps`:
  one decision per step, a numbered progress list, Back and Continue, and a
  review step with a readable summary, a single confirmation and one final
  action. Explain why Continue is blocked instead of disabling it silently.
- A step that must write before the flow moves on (create a preview, send a
  code, check it) passes its write as the step `action`: its button replaces
  Continue, uses `loading`, and the container advances the step only after the
  server confirms the write. Resuming opens the first step that is still
  pending.
- Optional reads and recoveries of a step go in its `secondary` slot, or in a
  `GuidedStepsDisclosure` under the flow, collapsed behind one summary, so the
  main path always shows a single next action.
- A final action that needs several writes (create, save, check, activate)
  runs them in sequence, names the current stage in a `role="status"` line and,
  on failure, says what was already saved and retries only what is left.
- Every button that writes uses `Button` `loading` while its request is in
  flight: it keeps its label and keyboard focus, and the other write buttons of
  the screen are disabled. Reads never change a write button's label.
- Confirm each action with its own success message (`role="status"` plus a
  success toast); never announce as saved what the server did not confirm.
- Default to the recommended choice (for example grouped notices) and warn in
  place when a choice silently disables the feature (a zero quota, omitted
  notices, closed admissions).
- Unpublished drafts: when settings are saved but not published (rules saved
  but never activated, a candidate connection that is not active), show one
  callout at the top ("Tenés reglas guardadas sin publicar", "Tenés una
  conexión guardada sin activar") with a single action that opens the exact
  publication point (the final step, or the pending step). The setup guide
  marks those steps "Borrador sin publicar" and links to the same point.
- When publishing is blocked, group the reasons by who resolves them. Reasons
  the leader resolves elsewhere link to that page with an allowlisted return
  (`?return=policy-review`, never a free URL), and that page offers "Volver a
  Reglas para activar". A decision the flow needs (for example memberships
  blocked by payment) becomes its own guided step just before the final one,
  and the flow returns to the final step when it is done. Reasons only the
  TuTribu team resolves go in a "Depende del equipo de TuTribu" group: plain
  language, a copyable diagnostic code, "Volver a comprobar" and "Reportar el
  problema"; never offer to publish while one is known.

## Multi-step workspaces

Use this pattern for a tool page where one record moves through several steps
(for example the messaging connection: Connection, Channels, Tests, Activation).

- Keep the page `h1` in the route; the workspace never repeats it.
- Start with a compact status summary: the record name once, then one `Badge`
  per independent fact (lifecycle, credential, account, each channel), each
  with a tone that keeps "ready" visibly different from "active".
- Highlight a single advisory next step under the summary with a button that
  opens its tab. It guides; the server still checks every requirement.
- Put each step in a `Tabs` panel with an `h2`. Show one `primary` action per
  panel; secondary reads are `secondary` and optional actions are `ghost` `sm`
  buttons grouped in one quiet row. Sensitive actions rely on the active
  session and their explicit confirmation; never add a step that asks to sign
  in with Google again.
- Keep drafts in the container, not in the panel, so switching tabs never
  loses input. Switching tabs must never save, send or activate anything.
- Blocking states (a pending original, a continuation link) go above the tabs
  so no tab hides them. A panel whose step is not available yet explains why
  and offers the step that unblocks it instead of an empty form.
- Show field errors only after the person edits that field or tries to submit.
- When an action reaches a terminal success, replace its inputs, countdowns and
  retries with the confirmed state, bound to the exact record it confirms.

## Notifications

- Notifications use `toast` and `ThemedToaster` from @golfo/ui, mounted once in
  `components/providers/app-providers`. Do not mount the raw `Toaster` and do
  not restyle toasts: their surface, icons and theme come from @golfo/ui, and
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
