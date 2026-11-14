#!/usr/bin/env node
/**
 * B:SPACE logo kit generator.
 *
 * Builds every file in assets/brand/b-space/ from the geometry below and
 * the outlined wordmark in assets/brand/b-space/src/wordmark.svg:
 *   - the mark (two-tone on dark, two-tone on light, one-colour versions)
 *   - the small mark (larger eyes, for 24 px and below)
 *   - the horizontal lockup (mark + B:SPACE)
 *   - the app icon (badge) and its small variant
 *   - drop-in masters for scripts/gen-icons.mjs (gen-icons/)
 *   - the character's states as static SVG frames (states/)
 *   - tray icons per state: macOS template PNGs, Windows .ico (tray/)
 *   - PNG previews of the mark, app icon and lockup (png/)
 *   - animated SVGs of the character's states for the GitHub README (animated/)
 *
 * The geometry is the source of truth; the SVG files are outputs. Run
 * `node scripts/b-space-kit.mjs` after changing anything here and commit
 * the diff. See assets/brand/b-space/README.md for the usage rules.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'assets/brand/b-space');
const DENSITY = 1200;

// ---- geometry: 100-unit grid, mark occupies x 20..80, y 10..90 ----
// Head: the upper reply, with its tail at the lower left (45°).
// Body: the lower reply; its upper-left corner is cut parallel to the
// head's tail, 5 units away, so the two replies read as one letter B.
const HEAD = 'M26 10H57A18 18 0 0 1 57 46H36Q33 46 30.88 48.12L21.77 57.23Q20 59 20 56.5V16A6 6 0 0 1 26 10Z';
const BODY = 'M32.95 53.12Q35.07 51 38.07 51H60.5A19.5 19.5 0 0 1 60.5 90H26A6 6 0 0 1 20 84V69.07Q20 66.07 22.12 63.95Z';
const MARK_BOX = [20, 10, 60, 80];

// Eyes: [cx, cy, rx, ry]. Standard eyes for 32 px and up; the small set
// is larger and wider apart so the holes survive at 16 px.
const EYES = { std: [[41, 26, 3.6, 5.6], [56, 26, 3.6, 5.6]], small: [[39.5, 27, 5, 7], [57, 27, 5, 7]] };

// The screen cut out of the body for the screen-sharing state.
const SCREEN = 'M43 60H65A3 3 0 0 1 68 63V77A3 3 0 0 1 65 80H43A3 3 0 0 1 40 77V63A3 3 0 0 1 43 60Z';

const C = {
  head: '#ededf0', // text-primary, on dark grounds
  ink: '#0c0c0e', // bg-base, the head on light grounds
  body: '#6e5bef', // accent-primary (Lavender theme fill)
  tone: '#a99dff', // accent-tone
  badge: '#1b1b1f', // bg-elevated, the app icon ground
  danger: '#f2777a', // status-danger, the unread dot
  ok: '#6fdc9a', // status-ok, the speaking ring
  offHead: '#7e7e89',
  offBody: '#4a4a52',
};

const f = (n) => +n.toFixed(2);
const ellipse = ([x, y, rx, ry]) => `M${f(x - rx)} ${y}a${rx} ${ry} 0 1 0 ${f(2 * rx)} 0a${rx} ${ry} 0 1 0 ${f(-2 * rx)} 0Z`;
const circle = (x, y, r) => ellipse([x, y, r, r]);
// A "^" eye: a crescent, so it can be cut out of the head like the others.
const happy = ([x, y]) => `M${f(x - 4.8)} ${f(y + 2.2)}Q${x} ${f(y - 6.4)} ${f(x + 4.8)} ${f(y + 2.2)}L${f(x + 3.2)} ${f(y + 3.4)}Q${x} ${f(y - 2.8)} ${f(x - 3.2)} ${f(y + 3.4)}Z`;
// An "x" eye as one 12-point outline (two crossed bars would cancel out
// where they overlap under the even-odd rule).
function cross([x, y], a = 3.8, w = 1.15) {
  const pts = [[w, a], [w, w], [a, w], [a, -w], [w, -w], [w, -a], [-w, -a], [-w, -w], [-a, -w], [-a, w], [-w, w], [-w, a]];
  const c = Math.SQRT1_2;
  return 'M' + pts.map(([px, py]) => `${f(x + (px - py) * c)} ${f(y + (px + py) * c)}`).join('L') + 'Z';
}

// Each state: how the eyes are cut, plus optional extras.
const STATES = {
  idle: { eyes: (e) => e.map(ellipse) },
  blink: { eyes: (e) => e.map(([x, y, rx]) => ellipse([x, y + 1, rx + 0.4, 1.3])) },
  'look-left': { eyes: (e) => e.map(([x, y, rx, ry]) => ellipse([x - 4, y + 1, rx, ry])) },
  'look-right': { eyes: (e) => e.map(([x, y, rx, ry]) => ellipse([x + 4, y, rx, ry])) },
  notify: { eyes: (e) => e.map(([x, y, rx, ry]) => ellipse([x, y, rx * 1.2, ry * 1.2])), badge: true },
  typing: { eyes: (e) => e.map(([x, y, rx, ry]) => ellipse([x - 3, y + 3, rx, ry])), bodyHoles: [42, 52, 62].map((x) => circle(x, 70.5, 3.4)) },
  voice: { eyes: (e) => e.map(ellipse), ring: true },
  joy: { eyes: (e) => e.map(happy) },
  // Screen sharing: the body becomes a screen, the eyes look down at it,
  // and a live dot sits in the screen's corner.
  screen: { eyes: (e) => e.map(([x, y, rx, ry]) => ellipse([x + 1.5, y + 3, rx, ry])), bodyHoles: [SCREEN], live: true },
  dnd: { eyes: (e) => e.map(([x, y, rx]) => ellipse([x, y + 1, rx + 0.4, 1.3])), muted: true },
  offline: { eyes: (e) => e.map((p) => cross(p)), off: true },
};

// Returns the inner SVG markup of the mark in grid units.
function markInner({ state = 'idle', eyes = 'std', head, body, badgeColor = C.danger, ringColor = C.ok, idp = 'm' }) {
  const s = STATES[state];
  const headD = HEAD + s.eyes(EYES[eyes]).join('');
  const bodyD = BODY + (s.bodyHoles || []).join('');
  let out = '';
  let headAttr = '';
  if (s.badge) {
    // The unread dot sits on the head's upper-right corner with a 3-unit
    // cut around it, so it reads in one colour too.
    out += `<defs><mask id="${idp}-badge" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><circle cx="77" cy="13" r="11" fill="#000"/></mask></defs>`;
    headAttr = ` mask="url(#${idp}-badge)"`;
  }
  if (s.ring) {
    // The speaking ring follows the body's outline 2.5 to 5.5 units out:
    // a wide stroke with the inner half masked away, so it never depends
    // on the ground colour. The head, drawn later, covers it where they meet.
    out += `<defs><mask id="${idp}-ring" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><path d="${BODY}" fill="#000" stroke="#000" stroke-width="5" stroke-linejoin="round"/></mask></defs>`;
    out += `<path d="${BODY}" fill="none" stroke="${ringColor}" stroke-width="11" stroke-linejoin="round" mask="url(#${idp}-ring)"/>`;
  }
  out += `<path d="${bodyD}" fill="${body}" fill-rule="evenodd"/>`;
  out += `<path d="${headD}" fill="${head}" fill-rule="evenodd"${headAttr}/>`;
  if (s.badge) out += `<circle cx="77" cy="13" r="8" fill="${badgeColor}"/>`;
  if (s.live) out += `<circle cx="46.5" cy="66.5" r="2.8" fill="${badgeColor}"/>`;
  return out;
}

const palette = {
  dark: { head: C.head, body: C.body },
  light: { head: C.ink, body: C.body },
  black: { head: '#000', body: '#000', badgeColor: '#000', ringColor: '#000' },
  white: { head: '#fff', body: '#fff', badgeColor: '#fff', ringColor: '#fff' },
  lavender: { head: C.body, body: C.body },
};
function stateColours(state, base) {
  if (STATES[state].off && (base === palette.dark || base === palette.light)) return { ...base, head: C.offHead, body: C.offBody };
  return base;
}

const header = (title) => `<!-- B:SPACE ${title}. Generated by scripts/b-space-kit.mjs; edit the script, not this file. -->\n`;

// Square 100x100 canvas (the mark is centred in it) or the tight box.
function markSvg(opts, { tight = false, size } = {}) {
  const vb = tight ? MARK_BOX.join(' ') : '0 0 100 100';
  const [w, h] = tight ? [MARK_BOX[2] * 2, MARK_BOX[3] * 2] : [size || 200, size || 200];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${markInner(opts)}</svg>\n`;
}

// ---- wordmark + lockup (font units: cap height 707, baseline y = 0) ----
const wordSrc = readFileSync(join(KIT, 'src/wordmark.svg'), 'utf8');
const wordD = wordSrc.match(/<path d="([^"]+)"/)[1];
const [wx0] = wordSrc.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
const wordW = Number(wordSrc.match(/viewBox="([^"]+)"/)[1].split(' ')[2]);
const CAP = 707;
const LOCK = (() => {
  const markH = CAP * 1.8; // mark is 1.8x the cap height
  const s = markH / MARK_BOX[3];
  const markW = MARK_BOX[2] * s;
  const top = -CAP / 2 - markH / 2; // mark centred on the cap-height midline
  const gap = 340; // 0.48 cap
  return { s, markW, markH, top, gap, width: markW + gap + wordW };
})();
function lockupSvg(markOpts, textColour) {
  const { s, markW, markH, top, gap, width } = LOCK;
  const tx = -MARK_BOX[0] * s;
  const ty = top - MARK_BOX[1] * s;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(width / 10)}" height="${f(markH / 10)}" viewBox="0 ${f(top)} ${f(width)} ${f(markH)}">` +
    `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(s)})">${markInner(markOpts)}</g>` +
    `<path transform="translate(${f(markW + gap - wx0)} 0)" fill="${textColour}" d="${wordD}"/></svg>\n`
  );
}

// ---- app icon: full-bleed badge on a 256 canvas, Apple's 22.37% radius ----
function appIconSvg({ small = false } = {}) {
  const markH = small ? 176 : 139; // the small variant fills more of the badge
  const s = markH / MARK_BOX[3];
  const t = 128 - 50 * s;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<rect width="256" height="256" rx="57.27" fill="${C.badge}"/>` +
    `<rect x="1" y="1" width="254" height="254" rx="56.27" fill="none" stroke="#fff" stroke-opacity="0.08" stroke-width="2"/>` +
    `<g transform="translate(${f(t)} ${f(t)}) scale(${f(s)})">${markInner({ ...palette.dark, eyes: small ? 'small' : 'std', idp: 'app' })}</g></svg>\n`
  );
}

// macOS menu-bar template: 18x22 px canvas (viewBox 0 0 180 220), glyph
// 16 px tall, small eyes. Pure black: macOS tints the alpha.
function trayTemplateSvg(state) {
  const s = 2; // 80 grid units -> 160 viewBox units = 16 px
  const tx = 90 - 50 * s;
  const ty = 110 - 50 * s;
  const opacity = STATES[state].off ? ' opacity="0.45"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="22" viewBox="0 0 180 220"><g${opacity} transform="translate(${tx} ${ty}) scale(${s})">${markInner({ ...palette.black, state, eyes: 'small', idp: `tray-${state}` })}</g></svg>\n`;
}


// ---- animated states (self-contained SVG with CSS keyframes) ----
// For places that show an SVG as an image, such as the GitHub README:
// the character sits on its own tile so it reads on light and dark pages,
// and the eyes are separate shapes painted in the tile colour so they can
// move. Same motion as the `.s-*` classes in docs/brand/b-space-logo.html.
const ANIM = ['blink', 'look', 'notify', 'typing', 'voice', 'screen', 'joy', 'dnd', 'offline'];
const TILE = C.badge;
function animTile(state, p) {
  const [l, r] = EYES.std;
  const eye = ([x, y, rx, ry]) => `<ellipse class="${p}e" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${TILE}"/>`;
  const off = state === 'offline';
  const head = off ? C.offHead : C.head;
  const body = off ? C.offBody : C.body;
  let eyes = '';
  if (state === 'joy') eyes = [l, r].map(([x, y]) => `<path d="M${x - 4.4} ${y + 2}Q${x} ${y - 5.6} ${x + 4.4} ${y + 2}" fill="none" stroke="${TILE}" stroke-width="3" stroke-linecap="round"/>`).join('');
  else if (off) eyes = [l, r].map(([x, y]) => `<path d="M${x - 3.2} ${y - 3.2}L${x + 3.2} ${y + 3.2}M${x + 3.2} ${y - 3.2}L${x - 3.2} ${y + 3.2}" stroke="${TILE}" stroke-width="2.6" stroke-linecap="round"/>`).join('');
  else if (state === 'dnd') eyes = [l, r].map(([x, y, rx]) => `<rect x="${x - rx - 0.4}" y="${y}" width="${2 * rx + 0.8}" height="2.6" rx="1.3" fill="${TILE}"/>`).join('');
  else eyes = eye(l) + eye(r);
  let out = '';
  if (state === 'voice') out += `<defs><mask id="${p}m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><path d="${BODY}" stroke="#000" stroke-width="5" stroke-linejoin="round"/></mask></defs><path class="${p}ring" d="${BODY}" fill="none" stroke="${C.ok}" stroke-width="11" stroke-linejoin="round" mask="url(#${p}m)"/>`;
  out += `<g class="${p}all">`;
  out += `<path class="${p}body" d="${BODY}${state === 'screen' ? SCREEN : ''}" fill="${body}" fill-rule="evenodd"/>`;
  if (state === 'screen') out += `<rect class="${p}glow" x="40" y="60" width="28" height="20" rx="3" fill="${C.tone}"/><circle class="${p}live" cx="46.5" cy="66.5" r="2.8" fill="${C.danger}"/>`;
  if (state === 'typing') out += [42, 52, 62].map((x, i) => `<circle class="${p}dot ${p}d${i}" cx="${x}" cy="70.5" r="3.4" fill="${C.head}"/>`).join('');
  out += `<path d="${HEAD}" fill="${head}"/><g class="${p}eyes">${eyes}</g></g>`;
  if (state === 'notify') out += `<circle class="${p}badge" cx="77" cy="13" r="8" fill="${C.danger}" stroke="${TILE}" stroke-width="3"/>`;
  if (state === 'dnd') out += `<path class="${p}z" d="M74 6h6l-6 7h6" fill="none" stroke="${C.offHead}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  const css = {
    blink: `.${p}e{animation:${p}k 3.2s infinite}@keyframes ${p}k{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.08)}}`,
    look: `.${p}eyes{animation:${p}k 4.5s infinite ease-in-out}@keyframes ${p}k{0%,15%,85%,100%{transform:translate(0,0)}25%,45%{transform:translate(-4.5px,1px)}55%,75%{transform:translate(4px,0)}}`,
    notify: `.${p}all{animation:${p}h 2.4s infinite}.${p}e{animation:${p}w 2.4s infinite}.${p}badge{animation:${p}p 2.4s infinite}@keyframes ${p}h{0%,55%,100%{transform:translateY(0)}62%{transform:translateY(-9px)}70%{transform:translateY(0)}76%{transform:translateY(-4px)}82%{transform:translateY(0)}}@keyframes ${p}w{0%,55%,85%,100%{transform:scale(1)}62%,78%{transform:scale(1.25)}}@keyframes ${p}p{0%,58%{transform:scale(0)}64%{transform:scale(1.15)}70%,100%{transform:scale(1)}}`,
    typing: `.${p}eyes{transform:translate(-3px,3px)}.${p}dot{animation:${p}t 1.2s infinite}.${p}d1{animation-delay:.2s}.${p}d2{animation-delay:.4s}@keyframes ${p}t{0%,60%,100%{opacity:.25}30%{opacity:1}}`,
    voice: `.${p}body{animation:${p}v .9s infinite}.${p}ring{animation:${p}r 1.8s infinite}@keyframes ${p}v{0%,100%{transform:scale(1)}20%{transform:scale(1.05)}40%{transform:scale(.99)}60%{transform:scale(1.04)}}@keyframes ${p}r{0%,100%{opacity:1}50%{opacity:.35}}`,
    screen: `.${p}eyes{animation:${p}s 3.6s infinite ease-in-out}.${p}glow{animation:${p}g 2.4s infinite ease-in-out}.${p}live{animation:${p}l 1.6s infinite}@keyframes ${p}s{0%,40%,80%,100%{transform:translate(1.5px,3px)}50%,70%{transform:translate(0,0)}}@keyframes ${p}g{0%,100%{opacity:.12}50%{opacity:.32}}@keyframes ${p}l{0%,55%,100%{opacity:1}65%,90%{opacity:.2}}`,
    joy: `.${p}all{animation:${p}h 1.6s infinite}@keyframes ${p}h{0%,55%,100%{transform:translateY(0)}62%{transform:translateY(-9px)}70%{transform:translateY(0)}76%{transform:translateY(-4px)}82%{transform:translateY(0)}}`,
    dnd: `.${p}all{opacity:.6}.${p}z{animation:${p}z 3s infinite}@keyframes ${p}z{0%{opacity:0;transform:translate(0,0)}30%{opacity:1}100%{opacity:0;transform:translate(6px,-8px)}}`,
    offline: `.${p}all{opacity:.8}`,
  }[state];
  return { markup: out, css: `.${p}t *{transform-box:fill-box;transform-origin:center}${css}` };
}
function animatedSvg(states, { cell = 120, gap = 12 } = {}) {
  let body = '';
  let css = '';
  states.forEach((state, i) => {
    const p = `s${i}`;
    const t = animTile(state, p);
    css += t.css;
    body += `<g transform="translate(${i * (cell + gap)} 0)"><rect width="${cell}" height="${cell}" rx="26" fill="${TILE}"/><g class="${p}t" transform="translate(${cell * 0.12} ${cell * 0.12}) scale(${(cell * 0.76) / 100})">${t.markup}</g></g>`;
  });
  const w = states.length * cell + (states.length - 1) * gap;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${cell}" viewBox="0 0 ${w} ${cell}"><style>${css}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>${body}</svg>\n`;
}

// ---- output ----
const files = [];
function write(rel, data) {
  const p = join(KIT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  files.push(rel);
}
const png = (svg, w, h = w) => sharp(Buffer.from(svg), { density: DENSITY }).resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();

async function main() {
  for (const d of ['gen-icons', 'states', 'tray', 'png', 'animated']) rmSync(join(KIT, d), { recursive: true, force: true });

  // Mark
  write('mark.svg', header('mark, two-tone, for dark grounds') + markSvg({ ...palette.dark }, { tight: true }));
  write('mark-on-light.svg', header('mark, two-tone, for light grounds') + markSvg({ ...palette.light }, { tight: true }));
  write('mark-mono-black.svg', header('mark, one colour, black') + markSvg({ ...palette.black }, { tight: true }));
  write('mark-mono-white.svg', header('mark, one colour, white') + markSvg({ ...palette.white }, { tight: true }));
  write('mark-mono-lavender.svg', header('mark, one colour, lavender') + markSvg({ ...palette.lavender }, { tight: true }));
  write('mark-small.svg', header('small mark (24 px and below), one colour, lavender') + markSvg({ ...palette.lavender, eyes: 'small' }, { tight: true }));

  // Lockup
  write('lockup.svg', header('horizontal lockup, for dark grounds') + lockupSvg({ ...palette.dark, idp: 'l' }, C.head));
  write('lockup-on-light.svg', header('horizontal lockup, for light grounds') + lockupSvg({ ...palette.light, idp: 'l' }, C.ink));
  write('lockup-mono-black.svg', header('horizontal lockup, one colour, black') + lockupSvg({ ...palette.black, idp: 'l' }, '#000'));
  write('lockup-mono-white.svg', header('horizontal lockup, one colour, white') + lockupSvg({ ...palette.white, idp: 'l' }, '#fff'));

  // App icon
  const app = appIconSvg();
  const appSmall = appIconSvg({ small: true });
  write('app-icon.svg', header('app icon') + app);
  write('app-icon-small.svg', header('app icon, 16 and 32 px') + appSmall);

  // Drop-in masters for scripts/gen-icons.mjs (same file names as assets/brand/)
  write('gen-icons/app-icon.svg', app);
  write('gen-icons/app-icon-small.svg', appSmall);
  write('gen-icons/mark-icon.svg', markSvg({ ...palette.dark }, { tight: true }));
  write('gen-icons/mark.svg', markSvg({ ...palette.lavender }, { tight: true }));
  write('gen-icons/mark-small.svg', markSvg({ ...palette.lavender, eyes: 'small' }, { tight: true }));
  write('gen-icons/mark-mono-light.svg', markSvg({ ...palette.white }, { tight: true }));
  write('gen-icons/mark-mono-dark.svg', markSvg({ ...palette.black }, { tight: true }));
  write('gen-icons/mark-tray.svg', trayTemplateSvg('idle'));

  // States: static frames of the character
  for (const state of Object.keys(STATES)) {
    write(`states/${state}.svg`, header(`character, state "${state}", for dark grounds`) + markSvg({ ...stateColours(state, palette.dark), state, idp: state }, { size: 200 }));
    write(`states/${state}-on-light.svg`, header(`character, state "${state}", for light grounds`) + markSvg({ ...stateColours(state, palette.light), state, idp: state }, { size: 200 }));
  }

  // Tray: macOS template PNGs and Windows .ico per state
  const TRAY = ['idle', 'notify', 'screen', 'dnd', 'offline'];
  const ICO_SIZES = [16, 20, 24, 32, 40, 48];
  for (const state of TRAY) {
    const tpl = trayTemplateSvg(state);
    write(`tray/mac/tray-${state}Template.svg`, tpl);
    write(`tray/mac/tray-${state}Template.png`, await sharp(Buffer.from(tpl), { density: DENSITY }).resize({ height: 22 }).png({ compressionLevel: 9 }).toBuffer());
    write(`tray/mac/tray-${state}Template@2x.png`, await sharp(Buffer.from(tpl), { density: DENSITY }).resize({ height: 44 }).png({ compressionLevel: 9 }).toBuffer());
    const colours = state === 'offline' ? { head: C.offHead, body: C.offHead } : palette.lavender;
    const winSvg = markSvg({ ...colours, state, eyes: 'small', idp: `win-${state}` }, { tight: true });
    write(`tray/win/tray-${state}.svg`, winSvg);
    const frames = [];
    for (const size of ICO_SIZES) {
      // Glyph inset like the platform's own tray glyphs: margin floor(size/8).
      const glyphH = size - Math.floor(size / 8);
      const glyph = await sharp(Buffer.from(winSvg), { density: DENSITY }).resize({ height: glyphH }).png().toBuffer();
      frames.push(await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: glyph, gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer());
    }
    write(`tray/win/tray-${state}.ico`, await pngToIco(frames));
  }

  // Animated states: one file per state and one row with all of them
  for (const state of ANIM) write(`animated/${state}.svg`, animatedSvg([state]));
  write('animated/states-row.svg', animatedSvg(ANIM));

  // PNG previews
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    write(`png/mark-${s}.png`, await png(markSvg({ ...palette.dark, eyes: s <= 24 ? 'small' : 'std' }), s));
    write(`png/app-icon-${s}.png`, await png(s <= 32 ? appSmall : app, s));
  }
  for (const [name, svg] of [['lockup', lockupSvg({ ...palette.dark, idp: 'l' }, C.head)], ['lockup-on-light', lockupSvg({ ...palette.light, idp: 'l' }, C.ink)]]) {
    const ratio = LOCK.width / LOCK.markH;
    for (const h of [64, 128]) write(`png/${name}-${h}.png`, await png(svg, Math.round(h * ratio), h));
  }

  console.log(`${files.length} files written to assets/brand/b-space/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
