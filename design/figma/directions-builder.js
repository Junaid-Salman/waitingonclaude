// Shared builder for the three UI directions. Pasted into use_figma after a direction config `D`.
// Colours are bound to the Color collection (light/* or dark/*); fonts, radii and motifs come from D.
const vars = await figma.variables.getLocalVariablesAsync("COLOR");
const VB = Object.fromEntries(vars.map(v => [v.name, v]));
let THEME = "light";
const col = tok => figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", VB[`${THEME}/${tok}`]);
const INK = { r: 0x23 / 255, g: 0x22 / 255, b: 0x1d / 255 };
for (const f of D.fonts) await figma.loadFontAsync(f);

function T(str, font, size, tok, o = {}) {
  const t = figma.createText();
  t.fontName = font; t.fontSize = size; t.characters = str; t.fills = [col(tok)];
  if (o.lh) t.lineHeight = { unit: "PIXELS", value: o.lh };
  if (o.ls != null) t.letterSpacing = { unit: "PERCENT", value: o.ls };
  if (o.upper) t.textCase = "UPPER";
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.w) { t.resize(o.w, t.height); t.textAutoResize = "HEIGHT"; }
  if (o.trunc) { t.resize(o.trunc, t.height); t.textAutoResize = "NONE"; t.textTruncation = "ENDING"; t.maxLines = 1; }
  return t;
}
function AL(dir, o = {}) {
  const f = figma.createAutoLayout(dir);
  f.fills = o.fill ? [col(o.fill)] : [];
  if (o.gap != null) f.itemSpacing = o.gap;
  if (o.pad != null) { const [t, r, b, l] = Array.isArray(o.pad) ? o.pad : [o.pad, o.pad, o.pad, o.pad]; f.paddingTop = t; f.paddingRight = r; f.paddingBottom = b; f.paddingLeft = l; }
  if (o.r != null) f.cornerRadius = o.r;
  if (o.stroke) { f.strokes = [col(o.stroke)]; f.strokeWeight = o.sw ?? 1; f.strokeAlign = "INSIDE"; }
  if (o.align) f.counterAxisAlignItems = o.align;
  if (o.justify) f.primaryAxisAlignItems = o.justify;
  if (o.name) f.name = o.name;
  if (o.fx) f.effects = o.fx;
  return f;
}
function add(parent, ...kids) { for (const k of kids) if (k) parent.appendChild(k); return parent; }
function fill(n, h = true, v = false) { if (h) n.layoutSizingHorizontal = "FILL"; if (v) n.layoutSizingVertical = "FILL"; return n; }
const hard = (x, y) => [{ type: "DROP_SHADOW", color: { ...INK, a: THEME === "light" ? 1 : 0.0 }, offset: { x, y }, radius: 0, spread: 0, visible: THEME === "light", blendMode: "NORMAL" }];
const soft = (y, a) => [{ type: "DROP_SHADOW", color: { ...INK, a }, offset: { x: 0, y }, radius: 0, spread: 0, visible: true, blendMode: "NORMAL" }];

const FG = { correct: "tile/correct-fg", present: "tile/present-fg", absent: "tile/absent-fg", typed: "foreground", empty: "foreground" };
function tile(letter, state, s) {
  const f = figma.createFrame();
  f.name = `Tile ${state}`; f.layoutMode = "HORIZONTAL"; f.primaryAxisAlignItems = "CENTER"; f.counterAxisAlignItems = "CENTER";
  f.resize(s, s); f.cornerRadius = D.r.tile; f.clipsContent = false;
  const filled = ["correct", "present", "absent"].includes(state);
  f.fills = filled ? [col(`tile/${state}`)] : (D.emptyFill ? [col(D.emptyFill)] : []);
  f.strokeAlign = "INSIDE";
  if (D.tileOutline) { f.strokes = [col(state === "typed" ? "tile/typed" : filled ? "foreground" : "tile/border")]; f.strokeWeight = D.tileOutline; }
  else if (state === "present") { f.strokes = [col("tile/present-edge")]; f.strokeWeight = 2; }
  else if (!filled) { f.strokes = [col(state === "typed" ? "tile/typed" : "tile/border")]; f.strokeWeight = D.tileStroke; }
  f.effects = D.tileFx(state);
  if (letter) add(f, T(letter, D.tileFont, Math.round(s * 0.5), FG[state], { upper: true }));
  return f;
}
function grid(rows, typing, s, gap) {
  const g = AL("VERTICAL", { gap, name: "Grid" });
  for (let r = 0; r < 6; r++) {
    const row = AL("HORIZONTAL", { gap });
    const data = rows[r];
    for (let c = 0; c < 5; c++) {
      if (data) add(row, tile(data[0][c], data[1][c], s));
      else if (r === rows.length) add(row, tile(typing[c] ?? "", typing[c] ? "typed" : "empty", s));
      else add(row, tile("", "empty", s));
    }
    add(g, row);
  }
  return g;
}
function mini(rows, s = 12) {
  const g = AL("VERTICAL", { gap: 3 });
  for (let r = 0; r < 6; r++) {
    const row = AL("HORIZONTAL", { gap: 3 });
    for (let c = 0; c < 5; c++) {
      const t = figma.createRectangle(); t.resize(s, s); t.cornerRadius = Math.min(D.r.tile, 3);
      const st = rows[r]?.[c];
      if (st) t.fills = [col(`tile/${st}`)]; else { t.fills = []; t.strokes = [col("tile/border")]; t.strokeWeight = 1; t.strokeAlign = "INSIDE"; }
      add(row, t);
    }
    add(g, row);
  }
  return g;
}
const KEYC = { c: "absent", a: "absent", n: "absent", e: "absent", s: "absent", l: "absent", r: "present", t: "present" };
function key(label, w, h) {
  const st = KEYC[label];
  const bg = st === "absent" ? "key/absent" : st ? `tile/${st}` : "key/idle";
  const fg = st === "absent" ? "key/absent-fg" : st ? FG[st] : "key/idle-fg";
  const k = AL("HORIZONTAL", { fill: bg, r: D.r.key, justify: "CENTER", align: "CENTER", fx: D.keyFx(), name: `Key ${label}` });
  if (D.keyOutline) { k.strokes = [col("foreground")]; k.strokeWeight = D.keyOutline; k.strokeAlign = "INSIDE"; }
  k.resize(w, h);
  add(k, T(label.length > 1 ? label : label.toUpperCase(), label.length > 1 ? D.bodySemi : D.keyFont, label.length > 1 ? 12 : 16, fg));
  return k;
}
function keyboard(total, h, gap) {
  const kb = AL("VERTICAL", { gap: gap + 2, align: "CENTER", name: "Keyboard" });
  const unit = (total - 9 * gap) / 10;
  for (const [i, row] of ["qwertyuiop", "asdfghjkl", "zxcvbnm"].entries()) {
    const r = AL("HORIZONTAL", { gap });
    if (i === 2) add(r, key("Enter", unit * 1.5 + gap / 2, h));
    for (const l of row) add(r, key(l, unit, h));
    if (i === 2) add(r, key("⌫", unit * 1.5 + gap / 2, h));
    add(kb, r);
  }
  return kb;
}
function button(label, kind = "primary", o = {}) {
  const map = { primary: ["primary", "primary-fg"], accent: ["accent", "accent-fg"], secondary: [D.secondaryFill, "foreground"] };
  const [bg, fg] = map[kind];
  const b = AL("HORIZONTAL", { fill: bg, r: D.r.btn, pad: o.small ? [8, 14, 8, 14] : [12, 20, 12, 20], justify: "CENTER", align: "CENTER", name: `Button ${label}`, fx: kind === "secondary" ? [] : D.btnFx() });
  if (kind === "secondary" || D.btnOutline) { b.strokes = [col(kind === "secondary" ? D.secondaryStroke : "foreground")]; b.strokeWeight = D.btnOutline || 1.5; b.strokeAlign = "INSIDE"; }
  add(b, T(label, D.bodySemi, o.small ? 14 : 15, fg));
  return b;
}
function input(placeholder, w) {
  const i = AL("HORIZONTAL", { fill: "surface", r: D.r.btn, pad: [12, 14, 12, 14], stroke: "border", sw: 1.5, name: "Input" });
  i.resize(w, 44); i.primaryAxisSizingMode = "FIXED";
  add(i, T(placeholder, D.mono ?? D.body, 15, "muted", { ls: D.mono ? 8 : 0 }));
  return i;
}
async function logo(small) {
  // The colour icon reads on both backgrounds; the lockup's ink wordmark needs the Paper version on dark.
  const id = small ? "1:29" : (THEME === "light" ? "2:8" : "2:22");
  const i = (await figma.getNodeByIdAsync(id)).createInstance();
  if (small) i.resize(36, 36); else i.resize(190.5, 23.8);
  return i;
}
function card(o = {}) { return AL("VERTICAL", { fill: "surface", r: D.r.card, pad: o.pad ?? 24, gap: o.gap ?? 16, stroke: D.cardStroke ? (D.cardStrokeTok ?? "border") : null, sw: D.cardStroke, fx: D.cardFx(), name: o.name ?? "Card" }); }
function screen(name, w, h, hug) {
  const s = AL("VERTICAL", { fill: "background", name });
  s.resize(w, h); s.primaryAxisSizingMode = hug ? "AUTO" : "FIXED"; s.counterAxisSizingMode = "FIXED"; s.clipsContent = true;
  return s;
}

// ---- content ----
const ME = [["crane", ["absent", "present", "absent", "absent", "absent"]], ["slate", ["absent", "absent", "absent", "present", "absent"]]];
const OPP = [
  { name: "Cy", rows: [["absent", "present", "absent", "absent", "absent"], ["correct", "absent", "correct", "absent", "absent"], ["correct", "correct", "correct", "correct", "correct"]], status: "Solved · 0:48", solved: true },
  { name: "Bo", rows: [["absent", "absent", "present", "absent", "absent"], ["correct", "absent", "absent", "absent", "present"]], status: "Playing" },
  { name: "Alexandria-Rose Okafor", rows: [["absent", "absent", "absent", "present", "absent"]], status: "Reconnecting…", away: true },
];
const SCORE = [["Cy", "2", "1:31"], ["You", "1", "2:05"], ["Bo", "0", "—"], ["Alexandria-Rose Okafor", "0", "—"]];

function opponentCard(o, w) {
  const c = AL("VERTICAL", { fill: "surface", r: D.r.card, pad: 12, gap: 8, stroke: D.cardStroke ? "border" : null, sw: D.cardStroke || 1, name: "Opponent" });
  if (o.away) c.opacity = 0.6;
  const head = AL("HORIZONTAL", { gap: 6, align: "CENTER" });
  add(c, head); fill(head);
  add(head, T(o.name, D.bodySemi, 14, "foreground", { trunc: w - 24 }));
  add(c, mini(o.rows), T(o.status, D.mono ?? D.body, 12, o.solved ? "tile/correct" : "muted"));
  c.resize(w, c.height); c.primaryAxisSizingMode = "AUTO";
  return c;
}
function header(w, phone, room) {
  const h = AL("HORIZONTAL", { pad: phone ? [12, 16, 12, 16] : [20, 48, 20, 48], align: "CENTER", justify: "SPACE_BETWEEN", name: "Header", fill: D.headerFill });
  return h;
}
function footer(phone) {
  const f = AL("HORIZONTAL", { pad: phone ? [20, 16, 24, 16] : [24, 48, 32, 48], name: "Footer" });
  add(f, T("Not affiliated with Anthropic or The New York Times. No accounts, no cookies, no tracking.", D.body, 13, "muted", { w: phone ? 358 : 900 }));
  return f;
}

async function homeScreen(phone) {
  const W = phone ? 390 : 1440;
  const s = screen(`${D.key} · Home · ${phone ? "390" : "1440"}`, W, phone ? 844 : 900, phone);
  if (D.topStrip) { const st = D.topStrip(W, "claude · working on your task · 4m 12s", 0.63); add(s, st); fill(st); }
  const h = header(W, phone); add(s, h); fill(h);
  add(h, await logo(phone));
  if (!phone) { const nav = AL("HORIZONTAL", { gap: 28, align: "CENTER" }); add(nav, T("Woordle", D.bodySemi, 15, "foreground"), T("How it works", D.body, 15, "muted"), button("Create room", "primary", { small: true })); add(h, nav); }
  else add(h, button("Create room", "primary", { small: true }));
  const main = AL(phone ? "VERTICAL" : "HORIZONTAL", { pad: phone ? [24, 16, 24, 16] : [56, 48, 40, 48], gap: phone ? 24 : 48, name: "Main" });
  add(s, main); fill(main);
  const hero = AL("VERTICAL", { gap: 16, name: "Hero" });
  add(main, hero); if (!phone) fill(hero); else fill(hero);
  if (D.eyebrow) add(hero, D.eyebrow());
  add(hero, T(D.headline, D.display, phone ? D.heroSize[1] : D.heroSize[0], "foreground", { lh: Math.round((phone ? D.heroSize[1] : D.heroSize[0]) * 1.08), ls: D.displayLs, w: phone ? 358 : 560 }));
  add(hero, T(D.sub, D.body, phone ? 16 : 18, "muted", { lh: phone ? 24 : 28, w: phone ? 358 : 520 }));
  if (D.heroArt && !phone) add(hero, D.heroArt());
  // Woordle card
  const wc = card({ name: "Woordle card", gap: 16, pad: phone ? 20 : 28 });
  add(main, wc); if (phone) fill(wc); else { wc.resize(520, wc.height); wc.primaryAxisSizingMode = "AUTO"; }
  const top = AL("HORIZONTAL", { gap: 12, align: "CENTER" }); add(wc, top);
  add(top, (await logo(true)), T("Woordle", D.display, 26, "foreground", { ls: D.displayLs }));
  add(wc, T("Guess the five-letter word. Race up to 5 friends over 5 rounds, or seal a challenge in a link.", D.body, 15, "muted", { lh: 22, w: phone ? 318 : 464 }));
  const acts = AL(phone ? "VERTICAL" : "HORIZONTAL", { gap: 10 }); add(wc, acts); fill(acts);
  for (const [l, k] of [["Create room", "primary"], ["Play solo", "secondary"], ["Make a challenge", "secondary"]]) { const b = button(l, k); add(acts, b); if (phone) fill(b); }
  const join = AL("HORIZONTAL", { gap: 10, align: "CENTER" }); add(wc, join); fill(join);
  add(join, T("Have a code?", D.body, 14, "muted"));
  const inp = input("KQXF", 120); add(join, inp); fill(inp);
  add(join, button("Join", "secondary", { small: true }));
  if (D.cardExtra) add(wc, D.cardExtra());
  const soon = AL("VERTICAL", { r: D.r.card, pad: 20, gap: 4, stroke: "border", sw: 1.5, name: "More games" });
  soon.dashPattern = [6, 4];
  add(soon, T("More games soon", D.bodySemi, 15, "foreground"), T("One quick game at a time. Ideas welcome.", D.body, 14, "muted"));
  if (phone) { add(main, soon); fill(soon); } else { add(wc, soon); fill(soon); }
  const ft = footer(phone); add(s, ft); fill(ft);
  return s;
}

async function matchScreen(phone, theme = "light") {
  THEME = theme;
  const W = phone ? 390 : 1440;
  const s = screen(`${D.key} · Match · ${phone ? "390" : "1440"}${theme === "dark" ? " · dark" : ""}`, W, phone ? 844 : 900, phone);
  if (D.topStrip) { const st = D.topStrip(W, "Round 3 of 5 · 1:42 left", 0.43); add(s, st); fill(st); }
  const h = header(W, phone); add(s, h); fill(h);
  const left = AL("HORIZONTAL", { gap: 12, align: "CENTER" });
  add(left, await logo(true), T("Room", D.body, 15, "muted"), T("KQXF", D.mono ?? D.bodySemi, 15, "foreground", { ls: D.mono ? 10 : 4 }));
  add(h, left, button("Leave room", "secondary", { small: true }));
  const main = AL(phone ? "VERTICAL" : "HORIZONTAL", { pad: phone ? [8, 16, 24, 16] : [24, 48, 32, 48], gap: phone ? 16 : 40, justify: "CENTER", name: "Main" });
  add(s, main); fill(main);
  // Scoreboard (desktop left)
  if (!phone) {
    const sb = card({ name: "Scoreboard", gap: 10, pad: 20 }); add(main, sb); sb.resize(280, sb.height); sb.primaryAxisSizingMode = "AUTO";
    add(sb, T(D.scoreTitle, D.bodySemi, 13, "muted", { upper: D.upperLabels, ls: D.upperLabels ? 6 : 0 }));
    SCORE.forEach(([n, wins, t], i) => {
      const r = AL("HORIZONTAL", { gap: 8, align: "CENTER", pad: [6, 0, 6, 0] }); add(sb, r); fill(r);
      add(r, T(String(i + 1), D.mono ?? D.bodySemi, 14, "muted"));
      const nm = T(n, n === "You" ? D.bodySemi : D.body, 15, "foreground", { trunc: 150 }); add(r, nm);
      add(r, T(`${wins} won`, D.bodySemi, 14, "foreground"), T(t, D.mono ?? D.body, 13, "muted"));
    });
  }
  const center = AL("VERTICAL", { gap: phone ? 12 : 16, align: "CENTER", name: "Board", fill: D.trayFill, r: D.r.card, pad: D.trayFill ? (phone ? 12 : 24) : 0 });
  add(main, center); if (phone) fill(center);
  const bar = AL("HORIZONTAL", { justify: "SPACE_BETWEEN", align: "CENTER" }); add(center, bar); fill(bar);
  add(bar, T("Round 3 of 5", D.display, phone ? 20 : 24, "foreground", { ls: D.displayLs }));
  const timer = AL("HORIZONTAL", { fill: D.timerFill, r: D.r.btn, pad: [6, 12, 6, 12], name: "Timer" });
  add(timer, T("1:42", D.mono ?? D.bodySemi, phone ? 18 : 20, D.timerFg)); add(bar, timer);
  add(center, T("Not in the word list", D.body, 14, "invalid"));
  const ts = phone ? 58 : 62;
  add(center, grid(ME, "ro", ts, phone ? 6 : 8));
  add(center, keyboard(phone ? 358 : 480, phone ? 50 : 54, phone ? 5 : 6));
  // Opponents
  const op = AL(phone ? "VERTICAL" : "VERTICAL", { gap: 12, name: "Opponents" }); add(main, op);
  if (!phone) { op.resize(240, op.height); op.primaryAxisSizingMode = "AUTO"; }
  add(op, T("Opponents", D.bodySemi, 13, "muted", { upper: D.upperLabels, ls: D.upperLabels ? 6 : 0 }));
  if (phone) {
    fill(op);
    const r1 = AL("HORIZONTAL", { gap: 10 }); add(op, r1); fill(r1);
    for (const o of OPP) { const c = opponentCard(o, 112); add(r1, c); fill(c); }
  } else for (const o of OPP) { const c = opponentCard(o, 240); add(op, c); }
  if (D.matchExtra && !phone) add(center, D.matchExtra());
  THEME = "light";
  return s;
}

// ---- build: one section per direction on the Directions page ----
let page = figma.root.children.find(p => p.name === "Directions");
if (!page) { page = figma.createPage(); page.name = "Directions"; }
await figma.setCurrentPageAsync(page);
for (const n of page.children.filter(n => n.name === `Direction ${D.key} · ${D.name}`)) n.remove();
const sec = figma.createSection(); sec.name = `Direction ${D.key} · ${D.name}`;
const frames = [await homeScreen(false), await matchScreen(false), await homeScreen(true), await matchScreen(true), await matchScreen(true, "dark")];
let x = 80, maxH = 0;
for (const f of frames) { sec.appendChild(f); f.x = x; f.y = 200; x += f.width + 80; maxH = Math.max(maxH, f.height); }
const title = T(`${D.key} · ${D.name}`, D.display, 40, "foreground"); sec.appendChild(title); title.x = 80; title.y = 60;
const note = T(D.note, D.body, 18, "muted", { w: 1400 }); sec.appendChild(note); note.x = 80; note.y = 120;
sec.resizeWithoutConstraints(x, maxH + 280);
sec.y = D.sectionY; sec.x = 0;
sec.fills = [col("sunken")];
return { section: sec.id, frames: frames.map(f => [f.name, f.id, Math.round(f.width), Math.round(f.height)]) };
