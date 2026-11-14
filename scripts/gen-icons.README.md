# Icon Generator

Regenerates every brand artefact from sources in `assets/brand/` (which `node scripts/b-space-kit.mjs` draws first):

- macOS `.icns`, Windows `.ico`, Linux per-size PNGs (`packages/desktop/build/`)
- Tray icons per tray state for all three platforms (`packages/desktop/resources/`)
- Web favicons, PWA manifest icons, maskable, in-app `logo.png` (`packages/web/public/icons/`)

## When to run

After changing any file under `assets/brand/`, **or** after bumping `sharp`,
`png-to-ico`, or `png2icons` in the root `package.json`. Commit the diff in
the same PR.

```bash
pnpm gen-icons
git status                       # review which files changed
git add packages/desktop/build/ packages/desktop/resources/ packages/web/public/icons/ assets/brand/app-icon-1024.png
git commit -m "chore: regenerate brand icons"
```

(Stage explicit paths rather than `git add -A` — the generator only writes to those four paths, and an unrelated working-tree change shouldn't accidentally land in a "regenerate icons" commit.)

## Determinism

Output is byte-stable for a given lockfile. The same SVGs in produce the
same PNG/ICO/ICNS bytes out, every time, on every OS — Sharp uses librsvg
internally and writes deterministic PNGs, png-to-ico and png2icons don't
embed timestamps.

**Caveat:** byte-stability is *not* guaranteed across version bumps of
the three encoder deps. After a Renovate / dependabot PR upgrades any of
them, run `pnpm gen-icons` once and commit the resulting diff inside the
same PR. That follow-up commit isn't an artwork change — it's encoder
output drift, and gating it inside the dep PR keeps the artwork-change
git history clean.

## Sources

The mark is the B:SPACE character, the letter B made of two chat
replies with eyes on the upper one. App icons put the two-tone mark (head
`#ededf0`, body `#6e5bef`) on a flat `#1b1b1f` badge at 22.37% corner
radius (Apple's own template radius). Favicons and the colour tray icons
use the one-colour lavender mark; the macOS tray uses black templates.

Every app-icon output renders straight from vector: there is no raster
source and no post-render masking. `app-icon.svg` carries its own badge,
so sharp/librsvg renders it at the target size and that's the pixel
output. The only routing decision by size is: 16 and 32 render from
`app-icon-small.svg` instead, whose mark fills more of the badge and has
larger eyes, so the eyes survive at that size. See `APP_ICON_SMALL_MAX`
in `gen-icons.mjs`.

On top of that size routing, two macOS-only outputs — `build/icon.icns`
and `build/icon.png` (the dev-mode Dock icon, also 512px) — apply
Apple's icon-grid margin: the visible artwork is rendered at
`round(size * 824/1024)` and centred on a transparent canvas of the
full requested size, a 100px margin each side at 1024. That's what
`macIconPng(size)` does, and it's the only place in this file a margin
is added; every other app-icon output (Linux `build/icons/*`, the
`.ico`, PWA `icon-192`/`icon-512`, `apple-touch-icon.png`, in-app
`logo.png`, `app-icon-1024.png`) stays full-bleed to the badge's own
edge, because those platforms frame the icon themselves. The `.icns`'s
ten reps all inherit the margin proportionally because png2icons
derives every rep by downscaling the single 1024 source it's handed
(see `writeAppIconIcns`), so feeding it the margined 1024 render is
enough — there's no per-rep hook to add the margin after the fact.

| Brand source                          | Drives                                                                              |
|----------------------------------------|--------------------------------------------------------------------------------------|
| `assets/brand/app-icon.svg`             | App-icon outputs >32px: Linux 48–1024, `build/icon.png`, `.ico` reps ≥48, apple-touch-icon, PWA 192/512, `logo.png`, the `app-icon-1024.png` reference export; also every `.icns` rep, since png2icons synthesises the whole iconset from the single 1024 render |
| `assets/brand/app-icon-small.svg`       | App-icon outputs at 16 and 32px: Linux 16/32, `.ico` reps 16/24/32 (the `.icns` set does not use this file) |
| `assets/brand/mark-icon.svg`            | PWA maskable inner mark: the two-tone mark, transparent, with no badge behind it |
| `assets/brand/mark-small.svg`           | Web favicons 16/32: the one-colour lavender mark with the larger eyes |
| `assets/brand/mark-mono-light.svg`      | `logo-mark.svg` (byte copy) |
| `assets/brand/tray/<state>-template.svg` | macOS menu-bar template + @2x per tray state (black + alpha; 18x22 canvas, 16px glyph) |
| `assets/brand/tray/<state>.svg`          | Windows `.ico` and Linux PNG per tray state (colour; glyph inset in the cell and centred by alpha centroid: 14..42px tall in the 16..48 `.ico` frames, 18px in the 22px Linux PNG) |

Tray states: `idle`, `notify`, `screen`, `dnd`, `offline` (`TRAY_STATES`,
which must match `packages/desktop/src/trayState.ts`).

All of these masters are generated: `node scripts/b-space-kit.mjs` draws
them from the mark's geometry (see `assets/brand/b-space/README.md`). Edit
the kit script, run it, then run this one. `assets/brand/mark.svg` and
`mark-mono-dark.svg` are written by the kit for other uses and not read here.

The tray inset and centroid centring apply to the tray files only; the
Windows and Linux app icons (`build/icon.ico`, `build/icons/*`) stay
full-bleed because those platforms frame launch icons themselves.

Two outputs composite the app icon or mark over an opaque copy of the
badge's ground (`#1b1b1f`, the same flat colour as `app-icon.svg`'s badge)
instead of leaving the canvas transparent:

- `apple-touch-icon.png`: the app icon full-bleed on the ground, so its
  rounded corners read as continuous badge instead of the transparent
  pixels iOS would otherwise paint black.
- `icon-maskable-512.png`: the ground fills the whole canvas (Android
  launcher masks crop arbitrarily past the icon's own bounds) with
  `mark-icon.svg` centred at 60% of the canvas height.

`Artworks-Backspace/` is the design archive — never read by this script.
