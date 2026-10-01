// CValRSketch — floor-plan PDF import.
// Copyright (C) 2026 CAA-EBV-CO-OP and the CValRSketch contributors.
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Reads a vector floor-plan PDF (iGUIDE today; other brands are new entries in
// FORMAT_PROFILES) and returns a sketch the app can merge. Everything runs in the
// browser: the PDF never leaves the machine. Loaded on demand by index.html,
// together with the vendored pdf.js, so normal start-up pays nothing for it.
//
// How a floor is read: every non-white filled path on the page (wall bands, room
// fills, window strips) is painted into a bitmap at roughly 1/4" per pixel; the
// region not reachable from the page edge is the floor's footprint (so enclosed
// white rooms such as a garage count, as they do in the brand's exterior area).
// Its outline is traced, simplified, and each edge re-fitted to the traced pixels
// so corners land where the drawn walls actually meet.

export const FORMAT_PROFILES = [
  {
    id: 'iguide',
    name: 'iGUIDE',
    detect: /\biGUIDE\b/,
    // A floor page carries "<Floor title>  Exterior Area 1740.67 sq ft"; room-list
    // and glossary pages do not, so they are skipped.
    areaLines: {
      exterior: /Exterior Area\s+([\d,]+(?:\.\d+)?)\s*sq\s*ft/i,
      interior: /Interior Area\s+([\d,]+(?:\.\d+)?)\s*sq\s*ft/i,
      excluded: /Excluded Area\s+([\d,]+(?:\.\d+)?)\s*sq\s*ft/i,
    },
    // First match wins; tested against the floor title.
    floors: [
      [/basement|lower|below\s*grade|cellar/i, 'basement', 'finished'],
      [/2nd|second|upper|upstairs|3rd|third|loft|attic|above|top/i, 'upper', 'upper'],
      [/main|ground|1st|first/i, 'main', 'living'],
    ],
    titleCleanup: /\s*\((?:above|below)\s*grade\)\s*/i,
    // Overview pages ("Carriage house: Total Exterior Area Above Grade …") name a
    // building and repeat its floors' area lines, which is how floors are matched to it.
    buildingLine: /^(.+?):\s*Total Exterior Area/i,
    // Scale bar: a row of alternating filled blocks, bottom-left, labelled 0 … N ft.
    scaleBar: { minYFrac: 0.82, maxXFrac: 0.35, maxBlockHeight: 8 },
    // The plan sits between the page header and the footer strip.
    planBand: [0.1, 0.86],
    minFloorSqft: 40,
  },
];

const TARGET_PX_PER_FT = 48;     // ~1/4" per pixel
const MAX_PIXELS = 24e6;
const SIMPLIFY_FT = 0.06;         // ~3/4": drawn window/door detail smaller than this is not a corner

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export async function readFloorPlanPdf(data, pdfjs, opts = {}) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
  const texts = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    texts.push(await pageText(page));
  }
  const all = texts.map(t => t.items.map(i => i.str).join(' ')).join('\n');
  const profile = FORMAT_PROFILES.find(p => p.detect.test(all));
  if (!profile) {
    return { ok: false, reason: 'unknown-format',
      message: 'This PDF is not a floor-plan format CValRSketch knows yet (supported: ' +
        FORMAT_PROFILES.map(p => p.name).join(', ') + ').' };
  }
  const buildingOf = new Map();                  // stated exterior area -> building name
  const buildingNames = [];
  for (const t of texts) {
    const b = t.items.map(i => i.str.match(profile.buildingLine)).find(Boolean);
    if (!b) continue;
    const name = b[1].trim();
    if (!buildingNames.includes(name)) buildingNames.push(name);
    t.items.forEach(i => { const m = i.str.match(profile.areaLines.exterior); if (m && !/total/i.test(i.str)) buildingOf.set(m[1], name); });
  }
  const floors = [];
  const warnings = [];
  let address = '';
  for (let n = 1; n <= doc.numPages; n++) {
    const t = texts[n - 1];
    const head = findFloorHeader(t, profile, buildingOf);
    if (!head) continue;
    if (!address) address = pageTitle(t);
    const page = await doc.getPage(n);
    const scale = findScaleBar(t, await pageFills(page, pdfjs, t.vt), profile);
    if (!scale) { warnings.push(`Page ${n} (${head.title}): no scale bar found — skipped.`); continue; }
    const fills = (await pageFills(page, pdfjs, t.vt)).filter(f => !f.white);
    const outlines = traceFloor(fills, t, scale.ftPerPt, profile);
    if (!outlines.length) { warnings.push(`Page ${n} (${head.title}): no closed outline (walls open on a side, e.g. a loft open to below) — draw it by hand.`); continue; }
    const [floor, type] = classifyFloor(head.title, profile);
    outlines.forEach((pts, k) => {
      floors.push({
        page: n, title: head.title + (outlines.length > 1 ? ` (${k + 1})` : ''), floor, type, building: head.building,
        points: pts, traced: Math.abs(signedArea(pts)), areas: head.areas, ftPerPt: scale.ftPerPt,
        part: k, parts: outlines.length,
      });
    });
  }
  // Some overview pages omit their floors' area lines; if exactly one named
  // building matched no floor, the unmatched floors are its.
  const unmatched = floors.filter(f => !f.building);
  const idle = buildingNames.filter(n => !floors.some(f => f.building === n));
  if (unmatched.length && idle.length === 1) unmatched.forEach(f => { f.building = idle[0]; });
  if (!floors.length) {
    return { ok: false, reason: 'no-floors', message: `Recognised ${profile.name}, but found no floor pages to import.`, warnings };
  }
  return { ok: true, format: profile.name, profileId: profile.id, address, floors, warnings,
    buildings: [...new Set(floors.map(f => f.building).filter(Boolean))] };
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
async function pageText(page) {
  const vp = page.getViewport({ scale: 1 });
  const vt = vp.transform;                       // PDF user space -> top-down page points
  const tc = await page.getTextContent();
  const items = tc.items.filter(i => i.str && i.str.trim()).map(i => {
    const [x, y] = apply(vt, i.transform[4], i.transform[5]);
    const size = Math.hypot(i.transform[2], i.transform[3]);
    return { str: i.str.trim(), x, y, w: i.width || 0, size };
  });
  return { items, width: vp.width, height: vp.height, vt };
}

function findFloorHeader(t, profile, buildingOf) {
  // Overview pages repeat every floor's area line; only single-floor pages are read.
  const exts = t.items.filter(i => profile.areaLines.exterior.test(i.str) && !/total/i.test(i.str));
  if (exts.length !== 1) return null;
  const ext = exts[0];
  // The title shares the baseline of "Exterior Area …" and sits to its left.
  const title = t.items
    .filter(i => Math.abs(i.y - ext.y) < 1.5 && i.x < ext.x)
    .sort((a, b) => a.x - b.x).map(i => i.str).join(' ')
    .replace(profile.titleCleanup, ' ').trim() || 'Floor';
  const areas = {};
  for (const [k, re] of Object.entries(profile.areaLines)) {
    const it = t.items.find(i => re.test(i.str) && !/total/i.test(i.str));
    if (it) areas[k] = parseFloat(it.str.match(re)[1].replace(/,/g, ''));
  }
  return { title, areas, building: buildingOf.get(ext.str.match(profile.areaLines.exterior)[1]) || null };
}

function pageTitle(t) {
  const top = t.items.filter(i => i.y < t.height * 0.12).sort((a, b) => b.size - a.size)[0];
  return top ? top.str : '';
}

function classifyFloor(title, profile) {
  for (const [re, floor, type] of profile.floors) if (re.test(title)) return [floor, type];
  return ['other', 'living'];
}

// ---------------------------------------------------------------------------
// Vector fills
// ---------------------------------------------------------------------------
const fillCache = new WeakMap();
async function pageFills(page, pdfjs, vt) {
  if (fillCache.has(page)) return fillCache.get(page);
  const ol = await page.getOperatorList();
  const O = pdfjs.OPS;
  const FILLS = new Map([[O.fill, 'nonzero'], [O.eoFill, 'evenodd'], [O.fillStroke, 'nonzero'],
    [O.eoFillStroke, 'evenodd'], [O.closeFillStroke, 'nonzero'], [O.closeEOFillStroke, 'evenodd']]);
  const out = [];
  let ctm = [1, 0, 0, 1, 0, 0], fill = [0, 0, 0], alpha = 1;
  const stack = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === O.save) stack.push([ctm, fill, alpha]);
    else if (fn === O.restore) { if (stack.length) [ctm, fill, alpha] = stack.pop(); }
    else if (fn === O.transform) ctm = mul(ctm, a);
    else if (fn === O.paintFormXObjectBegin) { stack.push([ctm, fill, alpha]); if (a && a[0]) ctm = mul(ctm, a[0]); }
    else if (fn === O.paintFormXObjectEnd) { if (stack.length) [ctm, fill, alpha] = stack.pop(); }
    else if (fn === O.setFillRGBColor) fill = hexRgb(a[0]);
    else if (fn === O.setGState) {
      for (const [k, v] of (a && a[0]) || []) if (k === 'ca') alpha = v;
    } else if (fn === O.constructPath) {
      const rule = FILLS.get(a[0]);
      if (!rule || alpha < 0.05) continue;
      const data = Array.isArray(a[1]) ? a[1][0] : a[1];
      if (!data || !data.length) continue;
      const m = mul(vt, ctm);
      const subs = flattenPath(data, m);
      if (!subs.length) continue;
      const white = fill[0] >= 0.97 && fill[1] >= 0.97 && fill[2] >= 0.97;
      out.push({ rule, subs, white, bbox: bboxOf(subs.flat()) });
    }
  }
  fillCache.set(page, out);
  return out;
}

function flattenPath(d, m) {
  const subs = [];
  let cur = null, sx = 0, sy = 0, px = 0, py = 0;
  const push = (x, y) => { const [X, Y] = apply(m, x, y); cur.push({ x: X, y: Y }); px = x; py = y; };
  for (let k = 0; k < d.length;) {
    const op = d[k++];
    if (op === 0) {                                     // moveTo
      if (cur && cur.length > 2) subs.push(cur);
      cur = []; sx = d[k]; sy = d[k + 1]; push(d[k], d[k + 1]); k += 2;
    } else if (op === 1) { if (!cur) { cur = []; } push(d[k], d[k + 1]); k += 2; }
    else if (op === 2) {                                // cubic
      const [x1, y1, x2, y2, x3, y3] = [d[k], d[k + 1], d[k + 2], d[k + 3], d[k + 4], d[k + 5]]; k += 6;
      const x0 = px, y0 = py;
      for (let s = 1; s <= 8; s++) {
        const t = s / 8, u = 1 - t;
        push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
             u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
    } else if (op === 3) {                              // quadratic
      const [x1, y1, x2, y2] = [d[k], d[k + 1], d[k + 2], d[k + 3]]; k += 4;
      const x0 = px, y0 = py;
      for (let s = 1; s <= 8; s++) {
        const t = s / 8, u = 1 - t;
        push(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
      }
    } else if (op === 4) {                              // closePath
      if (cur && cur.length > 2) subs.push(cur);
      cur = null; px = sx; py = sy;
    } else break;                                       // unknown opcode: stop reading this path
  }
  if (cur && cur.length > 2) subs.push(cur);
  return subs;
}

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------
function findScaleBar(t, fills, profile) {
  const sb = profile.scaleBar;
  const blocks = fills.filter(f => {
    const b = f.bbox;
    return b.y0 > t.height * sb.minYFrac && b.x1 < t.width * sb.maxXFrac &&
      (b.y1 - b.y0) < sb.maxBlockHeight && (b.y1 - b.y0) > 1 && (b.x1 - b.x0) > 3;
  });
  if (blocks.length < 2) return null;
  // Keep the blocks on the most common row.
  const rowY = blocks.map(f => Math.round(f.bbox.y0));
  const best = rowY.sort((a, b) => rowY.filter(v => v === b).length - rowY.filter(v => v === a).length)[0];
  const row = blocks.filter(f => Math.abs(f.bbox.y0 - best) < 1.5);
  const x0 = Math.min(...row.map(f => f.bbox.x0)), x1 = Math.max(...row.map(f => f.bbox.x1));
  const nums = t.items.filter(i => /^\d+(\.\d+)?$/.test(i.str) && i.y > t.height * sb.minYFrac && i.x < t.width * sb.maxXFrac)
    .map(i => parseFloat(i.str));
  const feet = nums.length ? Math.max(...nums) : 0;
  if (!(feet > 0) || !(x1 - x0 > 10)) return null;
  return { ftPerPt: feet / (x1 - x0), barPts: x1 - x0, feet };
}

// ---------------------------------------------------------------------------
// Footprint tracing
// ---------------------------------------------------------------------------
function traceFloor(fills, t, ftPerPt, profile) {
  const [b0, b1] = profile.planBand;
  const inBand = fills.filter(f => f.bbox.y0 > t.height * b0 && f.bbox.y1 < t.height * b1);
  if (!inBand.length) return [];
  const bb = bboxOf(inBand.map(f => [{ x: f.bbox.x0, y: f.bbox.y0 }, { x: f.bbox.x1, y: f.bbox.y1 }]).flat());
  let pxPerPt = TARGET_PX_PER_FT * ftPerPt;
  const pad = 4;
  const wPts = bb.x1 - bb.x0, hPts = bb.y1 - bb.y0;
  if (wPts * hPts * pxPerPt * pxPerPt > MAX_PIXELS) pxPerPt = Math.sqrt(MAX_PIXELS / (wPts * hPts));
  const W = Math.ceil(wPts * pxPerPt) + 2 * pad, H = Math.ceil(hPts * pxPerPt) + 2 * pad;
  const toPx = p => ({ x: (p.x - bb.x0) * pxPerPt + pad, y: (p.y - bb.y0) * pxPerPt + pad });
  const mask = new Uint8Array(W * H);
  inBand.forEach(f => fillPolygons(mask, W, H, f.subs.map(s => s.map(toPx)), f.rule));
  const footprint = fillHoles(mask, W, H);
  const comps = components(footprint, W, H);
  const pxPerFt = pxPerPt / ftPerPt;
  const minPx = profile.minFloorSqft * pxPerFt * pxPerFt;
  return comps.filter(c => c.area >= minPx).sort((a, b) => b.area - a.area).map(c => {
    const ring = traceBoundary(c.label, c.start, c.labels, W, H);
    const fitted = fitOutline(ring, SIMPLIFY_FT * pxPerFt);
    // pixels -> top-down page points -> feet
    return fitted.map(p => ({ x: ((p.x - pad) / pxPerPt + bb.x0) * ftPerPt, y: ((p.y - pad) / pxPerPt + bb.y0) * ftPerPt }));
  });
}

// Scanline fill (pixel-centre rule) of one path's subpaths into the mask.
export function fillPolygons(mask, W, H, polys, rule) {
  const edges = [];
  let minY = Infinity, maxY = -Infinity;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (a.y === b.y) continue;
      edges.push(a.y < b.y ? [a.x, a.y, b.x, b.y, 1] : [b.x, b.y, a.x, a.y, -1]);
      minY = Math.min(minY, a.y, b.y); maxY = Math.max(maxY, a.y, b.y);
    }
  }
  if (!edges.length) return;
  const r0 = Math.max(0, Math.ceil(minY - 0.5)), r1 = Math.min(H - 1, Math.floor(maxY - 0.5));
  const xs = [];
  for (let r = r0; r <= r1; r++) {
    const yc = r + 0.5;
    xs.length = 0;
    for (const [x0, y0, x1, y1, dir] of edges) {
      if (yc >= y0 && yc < y1) xs.push([x0 + (yc - y0) * (x1 - x0) / (y1 - y0), dir]);
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p[0] - q[0]);
    let wind = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      wind = rule === 'evenodd' ? wind ^ 1 : wind + xs[k][1];
      if (wind === 0) continue;
      const c0 = Math.max(0, Math.ceil(xs[k][0] - 0.5)), c1 = Math.min(W - 1, Math.floor(xs[k + 1][0] - 0.5));
      for (let c = c0, o = r * W + c0; c <= c1; c++, o++) mask[o] = 1;
    }
  }
}

// Everything the page edge cannot reach (4-connected through empty pixels) is footprint.
export function fillHoles(mask, W, H) {
  const out = new Uint8Array(W * H).fill(1);
  const stack = [];
  const seed = (x, y) => { const o = y * W + x; if (!mask[o] && out[o]) { out[o] = 0; stack.push(o); } };
  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
  for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
  while (stack.length) {
    const o = stack.pop(), x = o % W, y = (o - x) / W;
    if (x > 0) seed(x - 1, y); if (x < W - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1); if (y < H - 1) seed(x, y + 1);
  }
  return out;
}

export function components(fp, W, H) {
  const labels = new Int32Array(W * H);
  const comps = [];
  const stack = [];
  for (let o = 0; o < W * H; o++) {
    if (!fp[o] || labels[o]) continue;
    const label = comps.length + 1;
    let area = 0;
    labels[o] = label; stack.push(o);
    while (stack.length) {
      const p = stack.pop(); area++;
      const x = p % W, y = (p - x) / W;
      const visit = q => { if (fp[q] && !labels[q]) { labels[q] = label; stack.push(q); } };
      if (x > 0) visit(p - 1); if (x < W - 1) visit(p + 1);
      if (y > 0) visit(p - W); if (y < H - 1) visit(p + W);
    }
    comps.push({ label, area, start: o, labels });
  }
  return comps;
}

// Crack-following around one component (holes already filled), keeping the
// inside on the right. Returns the pixel-corner vertices where direction changes.
export function traceBoundary(label, start, labels, W, H) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && labels[y * W + x] === label;
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];             // E S W N
  const ahead = (cx, cy, d) => {                             // [leftAhead, rightAhead]
    switch (d) {
      case 0: return [inside(cx, cy - 1), inside(cx, cy)];
      case 1: return [inside(cx, cy), inside(cx - 1, cy)];
      case 2: return [inside(cx - 1, cy), inside(cx - 1, cy - 1)];
      default: return [inside(cx - 1, cy - 1), inside(cx, cy - 1)];
    }
  };
  const sx = start % W, sy = (start - sx) / W;
  let cx = sx, cy = sy, d = 0;
  const pts = [];
  let guard = 4 * W * H;
  do {
    const [la, ra] = ahead(cx, cy, d);
    const nd = la ? (d + 3) % 4 : ra ? d : (d + 1) % 4;
    if (nd !== d || !pts.length) pts.push({ x: cx, y: cy });
    if (nd !== d && !la && !ra) { d = nd; continue; }      // turned right in place; re-check before moving
    d = nd; cx += DX[d]; cy += DY[d];
  } while ((cx !== sx || cy !== sy || d !== 0) && --guard > 0);
  return pts;
}

// Simplify the staircase, then re-fit every edge to the traced points it spans and
// intersect neighbours, so corners sit where the walls meet (sub-pixel).
export function fitOutline(ring, tol = 1.25) {
  const n = ring.length;
  if (n < 3) return ring;
  // Douglas–Peucker on the closed ring, split at the two most distant vertices.
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const d = dist2(ring[0], ring[i]); if (d > fd) { fd = d; far = i; } }
  const keep = new Uint8Array(n); keep[0] = keep[far] = 1;
  const dp = (i, j) => {                                     // indices along the ring, i < j (j may be n -> 0)
    let best = -1, bi = -1;
    const a = ring[i], b = ring[j % n];
    for (let k = i + 1; k < j; k++) { const d = segDist(ring[k], a, b); if (d > best) { best = d; bi = k; } }
    if (best > tol) { keep[bi] = 1; dp(i, bi); dp(bi, j); }
  };
  dp(0, far); dp(far, n);
  const idx = []; for (let i = 0; i < n; i++) if (keep[i]) idx.push(i);
  // Fit a line to each run of ring points between kept vertices.
  const lines = idx.map((i, k) => {
    const j = idx[(k + 1) % idx.length];
    const run = [];
    for (let m = i; ; m = (m + 1) % n) { run.push(ring[m]); if (m === j) break; }
    return fitLine(run);
  });
  // Square up near-axis walls: drawn plans are mostly orthogonal.
  for (const L of lines) {
    const ang = Math.atan2(L.dy, L.dx) * 180 / Math.PI;
    const off = ((ang % 90) + 90) % 90;
    if (off < 1.5 || off > 88.5) {
      const r = Math.round(ang / 90) * 90 * Math.PI / 180;
      L.dx = Math.round(Math.cos(r)); L.dy = Math.round(Math.sin(r));
    }
  }
  const pts = [];
  for (let k = 0; k < lines.length; k++) {
    const A = lines[(k + lines.length - 1) % lines.length], B = lines[k];
    pts.push(intersect(A, B) || ring[idx[k]]);
  }
  return cleanRing(pts);
}

function fitLine(run) {
  let mx = 0, my = 0;
  run.forEach(p => { mx += p.x; my += p.y; }); mx /= run.length; my /= run.length;
  let sxx = 0, syy = 0, sxy = 0;
  run.forEach(p => { const x = p.x - mx, y = p.y - my; sxx += x * x; syy += y * y; sxy += x * y; });
  const a = run[0], b = run[run.length - 1];
  let dx, dy;
  if (run.length < 3) { dx = b.x - a.x; dy = b.y - a.y; }
  else { const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); dx = Math.cos(th); dy = Math.sin(th); }
  if (dx * (b.x - a.x) + dy * (b.y - a.y) < 0) { dx = -dx; dy = -dy; }
  const L = Math.hypot(dx, dy) || 1;
  return { x: mx, y: my, dx: dx / L, dy: dy / L };
}

function intersect(A, B) {
  const den = A.dx * B.dy - A.dy * B.dx;
  if (Math.abs(den) < Math.sin(4 * Math.PI / 180)) return null;   // near-parallel: keep the traced vertex
  const t = ((B.x - A.x) * B.dy - (B.y - A.y) * B.dx) / den;
  return { x: A.x + t * A.dx, y: A.y + t * A.dy };
}

// Drop vertices that are collinear, double back, or bound a sliver edge (< 2 px).
function cleanRing(pts) {
  let c = pts.slice();
  let changed = true;
  while (changed && c.length > 3) {
    changed = false;
    for (let i = 0; i < c.length; i++) {
      const a = c[(i + c.length - 1) % c.length], b = c[i], d = c[(i + 1) % c.length];
      const e1x = b.x - a.x, e1y = b.y - a.y, e2x = d.x - b.x, e2y = d.y - b.y;
      const l1 = Math.hypot(e1x, e1y), l2 = Math.hypot(e2x, e2y);
      const cross = Math.abs(e1x * e2y - e1y * e2x) / (l1 * l2 || 1);
      const dot = (e1x * e2x + e1y * e2y) / (l1 * l2 || 1);
      if (l1 < 2 || (cross < 0.02 && dot > 0) || dot < -0.95) { c.splice(i, 1); changed = true; break; }
    }
  }
  return c;
}

// ---------------------------------------------------------------------------
// Small geometry helpers
// ---------------------------------------------------------------------------
function mul(m, n) {   // m · n, PDF matrix order [a b c d e f]
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
          m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
          m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
function hexRgb(h) {
  if (Array.isArray(h) || ArrayBuffer.isView(h)) return Array.from(h).slice(0, 3).map(v => v > 1 ? v / 255 : v);
  const s = String(h).replace('#', '');
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
}
function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}
function dist2(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }
function segDist(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
  if (!L2) return Math.sqrt(dist2(p, a));
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}
export function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}
