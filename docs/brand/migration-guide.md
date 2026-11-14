# Moving a file to Kamen

How to convert one component file from the pre-Kamen markup to the brandbook
(`docs/brand/brandbook.md`). Stage 1 already changed every token, so a file
looks mostly right before it is touched; this pass removes what tokens cannot
reach: inline icons, values by eye, colours that bypass tokens.

The reference for how a screen should look is `docs/brand/directions.html`
(open it in a browser; direction "В · Камень", icons "Lucide").

## What must not change

- Behaviour, props, handlers, effects, store calls, federation logic.
- `data-*` attributes, `data-testid`, ids, roles, `aria-*`, i18n keys.
- Portals through `usePortalContainer()`.
- The glass tier classes (`.glass`, `.glass-bubble`, `.glass-modal`,
  `.glass-pill`, `.glass-strip`) and input tiers (`.input-*`).
- Anything that draws user content: avatar gradients, role colours, banners,
  the mascot, the Backspace mark.

If a test asserts a class or an inline SVG you replace, update the assertion
to the new markup; never delete a test to make it pass.

## Icons

Replace an inline `<svg>` icon with `<Icon name="…" size="…" />` from
`components/ui/Icon`. Sizes: `xs` 13 (inside tags), `sm` 15 (small buttons),
`md` 18 (regular), `lg` 20 (call bar). Colour comes from the parent's text
colour.

| Was drawn as | Name |
|---|---|
| text channel `#` | `hash` |
| speaker / voice channel | `volume-2` |
| microphone / muted | `mic` / `mic-off` |
| headphones / deafened | `headphones` / `headphone-off` |
| camera / off | `video` / `video-off` |
| screen share / stop | `screen-share` / `screen-share-off` |
| a monitor (stream source) | `monitor` |
| hang up, disconnect | `phone-off` |
| call | `phone` |
| gear | `settings` |
| cross, close | `x` |
| plus, add | `plus` |
| magnifier | `search` |
| bell / muted bell | `bell` / `bell-off` |
| people, members | `users` |
| add friend / remove | `user-plus` / `user-minus` |
| pin | `pin` |
| reply arrow | `reply` |
| pencil, edit | `pencil` |
| trash | `trash-2` |
| copy | `copy` |
| download / upload | `download` / `upload` |
| paperclip | `paperclip` |
| emoji face | `smile` |
| send | `send` |
| three dots | `ellipsis` (horizontal), `ellipsis-vertical` |
| chevrons | `chevron-down` / `-up` / `-left` / `-right` |
| check | `check` |
| eye / hidden | `eye` / `eye-off` |
| fullscreen / exit | `maximize` / `minimize` |
| grid | `layout-grid` |
| compass, explore | `compass` |
| warning triangle | `triangle-alert` |
| info circle | `info` |
| lock | `lock` |
| shield, moderation | `shield` |
| crown, owner | `crown` |
| link / external | `link` / `external-link` |
| globe, federation | `globe` |
| signal bars | `signal` (or `wifi` for the connection mark) |
| picture-in-picture | `picture-in-picture-2` |
| chat bubble | `message-square` |

The full list is `ICON_NAMES` in `components/ui/Icon.tsx`. If the glyph you
need is not there, do **not** edit `Icon.tsx` (several files are converted in
parallel): keep the inline SVG, set its `strokeWidth` to `1.75`, and list the
missing name in your report.

Keep as inline SVG: spinners, the Backspace mark, the mascot, charts and
graphs, the ping graph, avatar and status shapes, drawn illustrations.

A filled glyph that marks a state (a solid muted-mic) becomes the outline icon
with the state carried by colour and ground: muted or off is
`text-status-danger` on `bg-status-danger/[0.14]`; live or on is `text-on-accent`
on `bg-accent-primary`.

## Buttons

Use `Button` and `IconButton` from `components/ui` where the element is a plain
button.

| Was | Now |
|---|---|
| `bg-accent-primary … text-white` | `<Button variant="primary">` |
| neutral filled (`bg-white/5`, `bg-surface-elevated`) | `<Button variant="secondary">` |
| text-only, Cancel | `<Button variant="ghost">` |
| red text | `<Button variant="danger">` |
| red fill, confirming an irreversible action | `<Button variant="danger-solid">` |
| an icon-only `<button>` | `<IconButton icon="…" label={…}>`; the label is the existing `title` / `aria-label` text |

Sizes: `sm` 28, `md` 34 (default), `lg` 40. Pass through `onClick`, `disabled`,
`type`, `data-*`, refs. `Button` defaults to `type="button"`; a submit button
needs `type="submit"` explicitly. One primary button per row of actions.

Leave a `<button>` as it is when it is a row, a tile, a tab, a list item or
anything with custom layout inside; restyle it with tokens instead.

## Other primitives

- `Tag` for the live badge (`tone="live"`), quality labels (`tone="onMedia"`
  over a picture, `neutral` elsewhere), language labels (`color="…"`).
- `Badge` for unread dots and counts.
- `Options` for a row of mutually exclusive chips; `Tabs` for a segmented
  switch; `Progress` for a transfer bar; `Card`, `Field` for grouping.
- `Toggle`, `Modal`, `ConfirmDialog`, `Tooltip`, `Avatar` as before.

## Class mapping

Text size (no `text-[…px]`):

| Was | Now |
|---|---|
| 9–11.5px | `text-2xs` |
| 12–12.5px | `text-xs` |
| 13–13.5px | `text-compact` |
| 14–15px, `text-sm` | `text-sm` |
| 16–17px, `text-base`, `text-lg` | `text-lg` (titles) or `text-base` |
| 20px | `text-xl` |
| 24–32px | `text-2xl` |

Weights: `font-bold` → `font-semibold`. Section labels lose
`uppercase tracking-wider` and become `text-xs font-medium text-txt-tertiary`
(the catalogue strings are already sentence case). The one label that stays in
capitals is the live badge.

Radius (no `rounded-[…]`):

| Element | Class |
|---|---|
| tags, inline code, small chips | `rounded` (6) |
| buttons, fields, list rows, options, toasts | `rounded-lg` (10) |
| tiles, cards, popovers, the composer | `rounded-xl` (14) |
| dialogs | `rounded-2xl` (16) |
| avatars, switches, counts | `rounded-full` |

Colour:

| Was | Now |
|---|---|
| `bg-white/[0.02…0.04]`, a quiet raised ground | `bg-surface-elevated` (or nothing, when the tone of the parent already separates it) |
| `hover:bg-white/[0.04…0.08]`, `hover:bg-white/5` | `hover:bg-interactive-hover` |
| `bg-white/[0.1…0.16]`, pressed or selected | `bg-interactive-selected` / `active:bg-interactive-active` |
| `border-white/[0.04…0.08]` | `border-border-hard` (on base and sidebars) or `border-border-soft` (on elevated) |
| `bg-black/40…/80` under a dialog | `bg-surface-overlay` |
| `bg-black/…` over video or an image | keep, it sits on a picture |
| `text-white` on an accent fill | `text-on-accent` |
| `text-white` on a picture or a dark overlay | keep |
| `text-white` on a plain surface | `text-txt-primary` |
| `text-accent-primary`, `ring-accent-primary`, `border-accent-primary` on a dark surface | `…-accent-tone` |
| `bg-accent-primary/10…/20` tint | `bg-accent-tone/[0.16]` |
| `accent-rose`, `accent-peach` meaning error, danger, muted | `status-danger` |
| `accent-rose` / `bg-notification` meaning unread or waiting | `accent-secondary` (`Badge`) |
| `accent-mint` meaning online, ok, speaking | `status-ok` |
| `accent-amber` meaning warning or away | `status-warn` |
| `accent-mint` on the user's own reaction or message | `accent-tone` |
| hex and `rgb()` literals for UI | the matching token |
| Tailwind palette (`text-red-500`, `bg-green-500/20`, `text-sky-400`) | `status-danger`, `status-ok`, `txt-link` |

Layer (no `z-[…]`): `z-raised` 10 · `z-float` 20 · `z-popover` 200 (menus,
popovers, tooltips) · `z-modal` 200 (dialogs; same layer on purpose, overlays
stack by portal order) · `z-toast` 400 · `z-confirm` 500. A value between
tiers that orders two siblings inside one component may stay as a small
integer (`z-[1]`, `z-[2]`).

Motion: `transition-colors` alone keeps Tailwind's 150ms; add `duration-fast`
for colour and press, `duration-base ease-out` for something that moves,
`ease-pop` for a small bounce. Replace the dead classes
`animate-in fade-in zoom-in-95` with `animate-slide-up`.

Spacing: arbitrary `px-[10px]`, `gap-[10px]`, `h-[34px]` stay only where the
brandbook names the number (34 row and control height, 38 field, 48 header,
60 strip, 244 channel list); otherwise move to the 4px scale.

## After converting

In `packages/web`: `npx -y pnpm@10.34.3 exec tsc --noEmit`, then
`npx -y pnpm@10.34.3 exec vitest run <the directories you touched>`, then from
the repo root `npx -y pnpm@10.34.3 exec eslint <the files you touched> --max-warnings 0`.
All three must pass. `src/styles/colorTokens.test.ts` fails on a colour class
that does not exist: it is the quickest check that a token name is real.
