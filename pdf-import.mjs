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
// region not reachable from the page edge is the floor's footprint. Its outline is
// traced, simplified, and each edge re-fitted to the traced pixels so corners land
// where the drawn walls actually meet.
//
// On top of that, per floor: white rooms enclosed by walls (the brand's "excluded"
// rooms — garages, unheated sun rooms) are cut off as their own areas, sized so
// their total matches the excluded area the PDF states; labelled outdoor areas
// (DECK, PORCH, PATIO) are traced from the thin outline around the label. Across
// floors: each page is turned by its compass to match the main floor, then slid to
// where it overlaps the main floor best.

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
    // North arrow: a red needle, bottom-right. Each page is drawn turned to fit the
    // sheet, so the needle is how floors are turned back to one orientation.
    compass: { minXFrac: 0.8, minYFrac: 0.8 },
    // The plan sits between the page header and the footer strip.
    planBand: [0.1, 0.86],
    minFloorSqft: 40,
    // White rooms smaller than this are never excluded rooms. Above it, which white
    // rooms count is decided by the excluded area the PDF states (a 39 sf utility
    // beside a garage counts; a stairwell does not, unless the numbers say so).
    minExcludedSqft: 20,
    // Room label inside an excluded room -> area type.
    excludedTypes: [[/garage|carport/i, 'garage'], [/sun\s*room|screen|porch|solarium|season/i, 'porch']],
    // Outdoor labels outside the footprint -> area type.
    outdoorLabels: [[/\b(deck|sundeck|balcony|terrace|lanai|patio)\b/i, 'deck'], [/\b(porch|veranda|verandah)\b/i, 'porch']],
  },
];

const TARGET_PX_PER_FT = 48;     // ~1/4" per pixel
const MAX_PIXELS = 16e6;
const SIMPLIFY_FT = 0.06;         // ~3/4": drawn window/door detail smaller than this is not a corner
const MAX_WALL_FT = 0.8;          // an excluded room's own walls are never thicker than this
const MAX_OUTDOOR_SQFT = 3000;    // a "deck" bigger than this leaked out of an open outline
const JOIN_FT = 0.75;             // neighbouring shapes' corners closer than this are one corner
const MIN_EDGE_FT = 0.25;         // no wall shorter than 3" survives the join
const ZIGZAG_FT = 0.6;            // ...and corners of one shape this close, both at such a joint, collapse

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
  const pages = [];
  const warnings = [];
  let address = '';
  for (let n = 1; n <= doc.numPages; n++) {
    const t = texts[n - 1];
    const head = findFloorHeader(t, profile, buildingOf);
    if (!head) continue;
    if (!address) address = pageTitle(t);
    const paths = await pagePaths(await doc.getPage(n), pdfjs, t.vt);
    const scale = findScaleBar(t, paths.filter(p => p.rule), profile);
    if (!scale) { warnings.push(`Page ${n} (${head.title}): no scale bar found — skipped.`); continue; }
    const [floor, type] = classifyFloor(head.title, profile);
    const read = readFloorPage(paths, t, scale.ftPerPt, head, profile);
    if (!read.parts.some(p => p.kind === 'floor')) {
      warnings.push(`Page ${n} (${head.title}): no closed outline (walls open on a side, e.g. a loft open to below) — draw it by hand.`);
      continue;
    }
    read.notes.forEach(w => warnings.push(`Page ${n} (${head.title}): ${w}`));
    const pg = { page: n, title: head.title, floor, building: head.building, compass: findCompass(paths, t, profile), parts: [] };
    const floorParts = read.parts.filter(p => p.kind === 'floor');
    read.parts.forEach(p => {
      const one = p.kind === 'floor' ? floorParts.length === 1 : true;
      const f = {
        page: n, building: head.building, kind: p.kind, floor,
        title: p.kind === 'floor' ? head.title + (one ? '' : ` (${floorParts.indexOf(p) + 1})`) : p.label,
        type: p.kind === 'floor' ? type : p.type,
        points: p.points, traced: Math.abs(signedArea(p.points)),
        areas: p.kind === 'floor' ? head.areas : {},
        // What the PDF says this shape should measure: the floor without its excluded
        // rooms once they are cut off, or with them while they are still inside.
        stated: p.kind !== 'floor' || !one ? null
          : (head.areas.exterior ?? null) == null ? null
          : head.areas.exterior + (read.excludedSplit ? 0 : (head.areas.excluded || 0)),
        excludedTraced: p.kind === 'floor' && one && read.excludedSplit ? read.excludedTraced : null,
        ftPerPt: scale.ftPerPt, placement: 'reference', turned: 0,
      };
      floors.push(f); pg.parts.push(f);
    });
    pages.push(pg);
  }
  // Some overview pages omit their floors' area lines; if exactly one named
  // building matched no floor, the unmatched floors are its.
  const unmatched = pages.filter(p => !p.building);
  const idle = buildingNames.filter(n => !pages.some(p => p.building === n));
  if (unmatched.length && idle.length === 1) unmatched.forEach(p => { p.building = idle[0]; p.parts.forEach(f => { f.building = idle[0]; }); });
  if (!floors.length) {
    return { ok: false, reason: 'no-floors', message: `Recognised ${profile.name}, but found no floor pages to import.`, warnings };
  }
  alignPages(pages);
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
// Vector paths (fills and strokes)
// ---------------------------------------------------------------------------
async function pagePaths(page, pdfjs, vt) {
  const ol = await page.getOperatorList();
  const O = pdfjs.OPS;
  const FILLS = new Map([[O.fill, 'nonzero'], [O.eoFill, 'evenodd'], [O.fillStroke, 'nonzero'],
    [O.eoFillStroke, 'evenodd'], [O.closeFillStroke, 'nonzero'], [O.closeEOFillStroke, 'evenodd']]);
  const STROKES = new Set([O.stroke, O.closeStroke, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
  const out = [];
  let ctm = [1, 0, 0, 1, 0, 0], fill = [0, 0, 0], alpha = 1, lw = 1;
  const stack = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === O.save) stack.push([ctm, fill, alpha, lw]);
    else if (fn === O.restore) { if (stack.length) [ctm, fill, alpha, lw] = stack.pop(); }
    else if (fn === O.transform) ctm = mul(ctm, a);
    else if (fn === O.paintFormXObjectBegin) { stack.push([ctm, fill, alpha, lw]); if (a && a[0]) ctm = mul(ctm, a[0]); }
    else if (fn === O.paintFormXObjectEnd) { if (stack.length) [ctm, fill, alpha, lw] = stack.pop(); }
    else if (fn === O.setFillRGBColor) fill = hexRgb(a[0]);
    else if (fn === O.setLineWidth) lw = a[0];
    else if (fn === O.setGState) {
      for (const [k, v] of (a && a[0]) || []) { if (k === 'ca') alpha = v; else if (k === 'LW') lw = v; }
    } else if (fn === O.constructPath) {
      const rule = alpha >= 0.05 ? FILLS.get(a[0]) || null : null;
      const stroke = STROKES.has(a[0]);
      if (!rule && !stroke) continue;
      const data = Array.isArray(a[1]) ? a[1][0] : a[1];
      if (!data || !data.length) continue;
      const m = mul(vt, ctm);
      const subs = flattenPath(data, m);
      if (!subs.length) continue;
      const white = fill[0] >= 0.97 && fill[1] >= 0.97 && fill[2] >= 0.97;
      const red = fill[0] > 0.8 && fill[1] < 0.3 && fill[2] < 0.3;
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      out.push({ rule, stroke, subs, white, red, lineWidth: lw * scale, bbox: bboxOf(subs.flat()) });
    }
  }
  return out;
}

// Subpaths in top-down page points. Lines (2 points) are kept for strokes.
function flattenPath(d, m) {
  const subs = [];
  let cur = null, sx = 0, sy = 0, px = 0, py = 0;
  const push = (x, y) => { const [X, Y] = apply(m, x, y); cur.push({ x: X, y: Y }); px = x; py = y; };
  const end = closed => { if (cur && cur.length > 1) { cur.closed = closed; subs.push(cur); } cur = null; };
  for (let k = 0; k < d.length;) {
    const op = d[k++];
    if (op === 0) {                                     // moveTo
      end(false);
      cur = []; sx = d[k]; sy = d[k + 1]; push(d[k], d[k + 1]); k += 2;
    } else if (op === 1) { if (!cur) { cur = []; push(px, py); } push(d[k], d[k + 1]); k += 2; }
    else if (op === 2) {                                // cubic
      const [x1, y1, x2, y2, x3, y3] = [d[k], d[k + 1], d[k + 2], d[k + 3], d[k + 4], d[k + 5]]; k += 6;
      if (!cur) { cur = []; push(px, py); }
      const x0 = px, y0 = py;
      for (let s = 1; s <= 8; s++) {
        const t = s / 8, u = 1 - t;
        push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
             u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
    } else if (op === 3) {                              // quadratic
      const [x1, y1, x2, y2] = [d[k], d[k + 1], d[k + 2], d[k + 3]]; k += 4;
      if (!cur) { cur = []; push(px, py); }
      const x0 = px, y0 = py;
      for (let s = 1; s <= 8; s++) {
        const t = s / 8, u = 1 - t;
        push(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
      }
    } else if (op === 4) {                              // closePath
      end(true); px = sx; py = sy;
    } else break;                                       // unknown opcode: stop reading this path
  }
  end(false);
  return subs;
}

// ---------------------------------------------------------------------------
// Scale and north
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

// Direction the north needle points, in degrees (y-down, 0 = right), or null. The
// needle is a red half and a white half sharing a base; white centre -> red centre
// runs along it.
function findCompass(paths, t, profile) {
  const c = profile.compass;
  if (!c) return null;
  const near = p => p.rule && p.bbox.x0 > t.width * c.minXFrac && p.bbox.y0 > t.height * c.minYFrac;
  const red = paths.find(p => near(p) && p.red);
  if (!red) return null;
  const uniq = path => { const seen = new Set(); return path.subs.flat().filter(q => { const k = q.x.toFixed(2) + ',' + q.y.toFixed(2); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const rp = uniq(red), rc = centroidOf(rp);
  const size = red.bbox.x1 - red.bbox.x0 + red.bbox.y1 - red.bbox.y0;
  const touches = p => p.bbox.x0 <= red.bbox.x1 && p.bbox.x1 >= red.bbox.x0 && p.bbox.y0 <= red.bbox.y1 && p.bbox.y1 >= red.bbox.y0;
  const white = paths.find(p => near(p) && p.white && touches(p) && (p.bbox.x1 - p.bbox.x0 + p.bbox.y1 - p.bbox.y0) < 1.5 * size);
  if (white) { const wc = centroidOf(uniq(white)); return Math.atan2(rc.y - wc.y, rc.x - wc.x) * 180 / Math.PI; }
  const tip = rp.reduce((a, q) => (Math.hypot(q.x - rc.x, q.y - rc.y) > Math.hypot(a.x - rc.x, a.y - rc.y) ? q : a), rp[0]);
  return Math.atan2(tip.y - rc.y, tip.x - rc.x) * 180 / Math.PI;
}

// ---------------------------------------------------------------------------
// One floor page -> floor outline(s), excluded rooms, outdoor areas
// ---------------------------------------------------------------------------
function readFloorPage(paths, t, ftPerPt, head, profile) {
  const notes = [];
  const [b0, b1] = profile.planBand;
  const band = paths.filter(p => p.bbox.y0 > t.height * b0 && p.bbox.y1 < t.height * b1);
  const fills = band.filter(p => p.rule && !p.white);
  if (!fills.length) return { parts: [], notes };
  const bb = bboxOf(band.map(f => [{ x: f.bbox.x0, y: f.bbox.y0 }, { x: f.bbox.x1, y: f.bbox.y1 }]).flat());
  let pxPerPt = TARGET_PX_PER_FT * ftPerPt;
  const pad = 4;
  const wPts = bb.x1 - bb.x0, hPts = bb.y1 - bb.y0;
  if (wPts * hPts * pxPerPt * pxPerPt > MAX_PIXELS) pxPerPt = Math.sqrt(MAX_PIXELS / (wPts * hPts));
  const W = Math.ceil(wPts * pxPerPt) + 2 * pad, H = Math.ceil(hPts * pxPerPt) + 2 * pad;
  const N = W * H;
  const pxPerFt = pxPerPt / ftPerPt, sqftPx = pxPerFt * pxPerFt;
  const toPx = p => ({ x: (p.x - bb.x0) * pxPerPt + pad, y: (p.y - bb.y0) * pxPerPt + pad });
  const toFt = p => ({ x: ((p.x - pad) / pxPerPt + bb.x0) * ftPerPt, y: ((p.y - pad) / pxPerPt + bb.y0) * ftPerPt });
  const pixelAt = (x, y) => { const px = toPx({ x, y }); const X = Math.floor(px.x), Y = Math.floor(px.y); return X >= 0 && Y >= 0 && X < W && Y < H ? Y * W + X : -1; };
  const textAt = it => pixelAt(it.x + it.w / 2, it.y - it.size * 0.35);

  const ink = new Uint8Array(N);
  fills.forEach(f => fillPolygons(ink, W, H, f.subs.map(s => s.map(toPx)), f.rule));
  const fp = fillHoles(ink, W, H);
  const lab = new Int32Array(N);
  const trace = (label, start) => fitOutline(traceBoundary(label, start, lab, W, H), SIMPLIFY_FT * pxPerFt).map(toFt);
  const parts = [];

  // --- excluded rooms: white regions enclosed inside the footprint ----------------
  const holes = labelWhere(lab, W, H, o => fp[o] && !ink[o], 1);
  const stated = head.areas.excluded || 0;
  let excludedSplit = false, excludedTraced = 0;
  const cands = holes.filter(h => h.area >= profile.minExcludedSqft * sqftPx).sort((a, b) => b.area - a.area).slice(0, 10);
  if (stated > 0 && cands.length) {
    const maxR = Math.round(MAX_WALL_FT * pxPerFt);
    const grow = growInto(lab, W, H, cands, o => fp[o] && lab[o] === 0, maxR);
    const pick = chooseExcluded(cands, grow.hist, maxR, stated, sqftPx, pxPerFt);
    if (pick) {
      const chosen = new Set(pick.ids);
      for (let o = 0; o < N; o++) {
        const l = lab[o];
        if (l > 0 && l <= holes.length && !chosen.has(l)) lab[o] = 0;            // small/unused white areas stay with the floor
        else if (l === 0 && grow.owner[o] && chosen.has(grow.owner[o]) && grow.dist[o] <= pick.r * 10) lab[o] = grow.owner[o];
      }
      // The room's exterior walls (between it and the outside) go with it; walls it
      // shares with the house stay with the house.
      const out = distFromOutside(fp, W, H, maxR * 10);
      for (let o = 0; o < N; o++) {
        if (lab[o] !== 0 || !fp[o] || !chosen.has(grow.owner[o])) continue;
        if (grow.dist[o] + out[o] <= maxR * 10) lab[o] = grow.owner[o];
      }
      excludedSplit = true;
      for (const h of cands.filter(c => chosen.has(c.label))) {
        const start = firstOf(lab, h.label);
        const pts = trace(h.label, start);
        const name = roomLabel(t, textAt, lab, h.label);
        const type = (profile.excludedTypes.find(([re]) => re.test(name)) || [null, 'misc'])[1];
        parts.push({ kind: 'excluded', label: name ? titleCase(name) : 'Excluded area', type, points: pts });
        excludedTraced += Math.abs(signedArea(pts));
      }
    } else {
      notes.push(`its ${Math.round(stated)} sf of excluded rooms could not be matched to white rooms in the drawing, so they stay inside the floor — split them by hand.`);
      for (let o = 0; o < N; o++) if (lab[o] > 0) lab[o] = 0;
    }
  } else {
    for (let o = 0; o < N; o++) if (lab[o] > 0) lab[o] = 0;
  }

  // --- the floor itself: footprint minus the excluded rooms -------------------------
  const FLOOR0 = 100000;
  const floorComps = labelWhere(lab, W, H, o => fp[o] && lab[o] === 0, FLOOR0)
    .filter(c => c.area >= profile.minFloorSqft * sqftPx).sort((a, b) => b.area - a.area);
  floorComps.forEach(c => parts.unshift({ kind: 'floor', points: trace(c.label, c.start) }));

  // --- outdoor areas: the closed thin outline around a DECK / PORCH / PATIO label ----
  const wall = ink.slice();
  const strokeR = Math.max(1, pxPerPt * 0.5);
  band.filter(p => p.stroke).forEach(p => {
    const r = Math.max(strokeR, (p.lineWidth || 0) * pxPerPt / 2);
    p.subs.forEach(s => {
      const q = s.map(toPx);
      for (let i = 0; i < q.length - 1 + (s.closed ? 1 : 0); i++) stampLine(wall, W, H, q[i], q[(i + 1) % q.length], r);
    });
  });
  let outId = 200000;
  for (const it of t.items) {
    const kind = profile.outdoorLabels.find(([re]) => re.test(it.str));
    if (!kind) continue;
    const o = textAt(it);
    if (o < 0 || fp[o] || wall[o] || lab[o] !== 0) continue;
    const id = ++outId;
    const reg = floodRegion(lab, W, H, o, q => !fp[q] && !wall[q] && lab[q] === 0, id, MAX_OUTDOOR_SQFT * sqftPx);
    if (!reg.closed) {
      notes.push(`"${it.str}" has no closed outline — draw it by hand.`);
      continue;
    }
    if (reg.area < 10 * sqftPx) continue;
    parts.push({ kind: 'outdoor', label: titleCase(it.str), type: kind[1], points: trace(id, reg.start) });
  }
  joinNeighbours(parts.filter(p => p.kind !== 'outdoor'));
  joinNeighbours(parts);
  if (excludedSplit) excludedTraced = parts.filter(p => p.kind === 'excluded').reduce((a, p) => a + Math.abs(signedArea(p.points)), 0);
  return { parts, notes, excludedSplit, excludedTraced };
}

// Neighbouring shapes (floor, garage, sun room, deck) are traced separately, so
// where they meet their corners land a few inches apart and leave short zigzag
// edges. Corners of different shapes within JOIN_FT of each other, chained, become
// one shared corner, placed where the highest-ranking shape had it. Corners within one shape are never merged with each other
// unless a neighbour ties them together, so real short jogs survive.
function joinNeighbours(parts) {
  const verts = [];
  parts.forEach((p, pi) => p.points.forEach((q, vi) => verts.push({ pi, vi, q })));
  const parent = verts.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const near = (a, b) => Math.hypot(a.q.x - b.q.x, a.q.y - b.q.y) <= JOIN_FT;
  const joint = new Set();
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      if (verts[i].pi !== verts[j].pi && near(verts[i], verts[j])) { parent[find(i)] = find(j); joint.add(i); joint.add(j); }
    }
  }
  // Chain joint corners that sit close together (a 3-corner zigzag on one side
  // meeting a 2-corner one on the other).
  const js = [...joint];
  const tight = (a, b) => Math.hypot(a.q.x - b.q.x, a.q.y - b.q.y) <= ZIGZAG_FT;
  for (let a = 0; a < js.length; a++) for (let b = a + 1; b < js.length; b++) if (tight(verts[js[a]], verts[js[b]])) parent[find(js[a])] = find(js[b]);
  const groups = new Map();
  js.forEach(i => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  // The shared corner sits where the floor's own corner is (then an excluded
  // room's); decks and porches move to the building, never the other way round.
  const rank = { floor: 0, excluded: 1, outdoor: 2 };
  const shared = new Set();
  for (const g of groups.values()) {
    const top = Math.min(...g.map(i => rank[parts[verts[i].pi].kind] ?? 3));
    const c = centroidOf(g.filter(i => (rank[parts[verts[i].pi].kind] ?? 3) === top).map(i => verts[i].q));
    const at = { x: c.x, y: c.y };
    shared.add(at);
    g.forEach(i => { parts[verts[i].pi].points[verts[i].vi] = at; });
  }
  parts.forEach(p => {
    const out = [];
    p.points.forEach(q => { const last = out[out.length - 1]; if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 0.01) out.push(q); });
    while (out.length > 3 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 0.01) out.pop();
    p.points = dropStraight(dropTiny(out, shared));
  });
}

// Collapse edges shorter than MIN_EDGE_FT: a shared corner stays put and absorbs its
// neighbour; otherwise the two corners meet halfway.
function dropTiny(pts, shared) {
  let c = pts.slice(), changed = true;
  while (changed && c.length > 3) {
    changed = false;
    for (let i = 0; i < c.length; i++) {
      const j = (i + 1) % c.length, a = c[i], b = c[j];
      if (Math.hypot(b.x - a.x, b.y - a.y) >= MIN_EDGE_FT) continue;
      const keep = shared.has(a) ? a : shared.has(b) ? b : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      c[i] = keep; c.splice(j, 1);
      changed = true; break;
    }
  }
  return c;
}

// Remove corners that no longer turn (merging can leave three corners in a line).
function dropStraight(pts) {
  let c = pts.slice(), changed = true;
  while (changed && c.length > 3) {
    changed = false;
    for (let i = 0; i < c.length; i++) {
      const a = c[(i + c.length - 1) % c.length], b = c[i], d = c[(i + 1) % c.length];
      const e1x = b.x - a.x, e1y = b.y - a.y, e2x = d.x - b.x, e2y = d.y - b.y;
      const l1 = Math.hypot(e1x, e1y), l2 = Math.hypot(e2x, e2y);
      const sin = Math.abs(e1x * e2y - e1y * e2x) / (l1 * l2 || 1), dot = e1x * e2x + e1y * e2y;
      if ((sin < 0.02 && dot > 0) || (sin < 0.05 && dot < 0)) { c.splice(i, 1); changed = true; break; }
    }
  }
  return c;
}

// Label 4-connected components of pixels where pred(o) holds, ids from firstId.
function labelWhere(lab, W, H, pred, firstId) {
  const comps = [];
  const stack = [];
  let id = firstId;
  for (let o = 0; o < W * H; o++) {
    if (lab[o] || !pred(o)) continue;
    const label = id++;
    let area = 0;
    lab[o] = label; stack.push(o);
    while (stack.length) {
      const p = stack.pop(); area++;
      const x = p % W;
      if (x > 0 && !lab[p - 1] && pred(p - 1)) { lab[p - 1] = label; stack.push(p - 1); }
      if (x < W - 1 && !lab[p + 1] && pred(p + 1)) { lab[p + 1] = label; stack.push(p + 1); }
      if (p >= W && !lab[p - W] && pred(p - W)) { lab[p - W] = label; stack.push(p - W); }
      if (p < W * (H - 1) && !lab[p + W] && pred(p + W)) { lab[p + W] = label; stack.push(p + W); }
    }
    comps.push({ label, area, start: o });
  }
  return comps;
}

function firstOf(lab, label) { for (let o = 0; o < lab.length; o++) if (lab[o] === label) return o; return -1; }

// Flood from one pixel; stops (closed = false) if it reaches the edge or grows too big.
function floodRegion(lab, W, H, start, pred, id, maxArea) {
  const stack = [start];
  lab[start] = id;
  let area = 0, closed = true, first = start;
  while (stack.length) {
    const p = stack.pop(); area++;
    if (p < first) first = p;
    const x = p % W, y = (p - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || area > maxArea) { closed = false; break; }
    for (const q of [p - 1, p + 1, p - W, p + W]) if (lab[q] === 0 && pred(q)) { lab[q] = id; stack.push(q); }
  }
  if (!closed) { for (let o = 0; o < lab.length; o++) if (lab[o] === id) lab[o] = -1; }
  return { closed, area, start: first };
}

// Distance (tenths of a pixel, 8-connected) from the outside into the footprint, up to lim.
function distFromOutside(fp, W, H, lim) {
  const N = W * H;
  const dist = new Uint16Array(N).fill(65535);
  const buckets = Array.from({ length: lim + 15 }, () => []);
  for (let o = 0; o < N; o++) {
    if (!fp[o]) continue;
    const x = o % W;
    if ((x > 0 && !fp[o - 1]) || (x < W - 1 && !fp[o + 1]) || (o >= W && !fp[o - W]) || (o < N - W && !fp[o + W])) { dist[o] = 5; buckets[5].push(o); }
  }
  const steps = [[-1, 10], [1, 10], [-W, 10], [W, 10], [-W - 1, 14], [-W + 1, 14], [W - 1, 14], [W + 1, 14]];
  for (let d = 0; d <= lim; d++) {
    for (const p of buckets[d]) {
      if (dist[p] !== d) continue;
      const x = p % W;
      for (const [st, w] of steps) {
        const q = p + st, nd = d + w;
        if (q < 0 || q >= N || nd > lim || Math.abs((q % W) - x) > 1 || !fp[q]) continue;
        if (nd < dist[q]) { dist[q] = nd; buckets[nd].push(q); }
      }
    }
    buckets[d] = null;
  }
  return dist;
}

// Multi-source growth from the candidate rooms into wall pixels (8-connected,
// distances in tenths of a pixel). Each pixel belongs to its nearest room;
// hist[label][d] counts the pixels it gains at distance d (whole pixels).
function growInto(lab, W, H, cands, passable, maxR) {
  const N = W * H, LIM = maxR * 10;
  const dist = new Uint16Array(N).fill(65535);
  const owner = new Int32Array(N);
  const buckets = Array.from({ length: LIM + 15 }, () => []);
  const ids = new Set(cands.map(c => c.label));
  for (let o = 0; o < N; o++) {
    if (!ids.has(lab[o])) continue;
    const x = o % W;
    const edge = (x > 0 && lab[o - 1] !== lab[o]) || (x < W - 1 && lab[o + 1] !== lab[o]) || lab[o - W] !== lab[o] || lab[o + W] !== lab[o];
    if (edge) { dist[o] = 0; owner[o] = lab[o]; buckets[0].push(o); }
  }
  const steps = [[-1, 10], [1, 10], [-W, 10], [W, 10], [-W - 1, 14], [-W + 1, 14], [W - 1, 14], [W + 1, 14]];
  for (let d = 0; d <= LIM; d++) {
    const b = buckets[d];
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (dist[p] !== d) continue;
      const x = p % W;
      for (const [s, w] of steps) {
        const q = p + s, nd = d + w;
        if (q < 0 || q >= N || nd > LIM) continue;
        const qx = q % W;
        if (Math.abs(qx - x) > 1) continue;
        if (nd < dist[q] && passable(q)) { dist[q] = nd; owner[q] = owner[p]; buckets[nd].push(q); }
      }
    }
    buckets[d] = null;
  }
  const hist = new Map(cands.map(c => [c.label, new Float64Array(maxR + 1)]));
  for (let o = 0; o < N; o++) {
    if (!owner[o] || dist[o] === 0 || dist[o] === 65535 || lab[o] !== 0) continue;
    hist.get(owner[o])[Math.ceil(dist[o] / 10)]++;
  }
  return { dist, owner, hist };
}

// Which white rooms, grown by how much wall, add up to the excluded area the PDF
// states. Returns { ids, r } or null when nothing comes close.
function chooseExcluded(cands, hist, maxR, stated, sqftPx, pxPerFt) {
  const typical = 0.45 * pxPerFt;                       // a usual exterior wall
  const cum = cands.map(c => { const h = hist.get(c.label); const a = new Float64Array(maxR + 1); let s = c.area; for (let r = 0; r <= maxR; r++) { s += h[r]; a[r] = s; } return a; });
  let best = null;
  for (let mask = 1; mask < (1 << cands.length); mask++) {
    for (let r = 0; r <= maxR; r++) {
      let tot = 0;
      for (let i = 0; i < cands.length; i++) if (mask & (1 << i)) tot += cum[i][r];
      const err = Math.abs(tot / sqftPx - stated);
      const score = err + Math.abs(r - typical) / pxPerFt;   // prefer a believable wall thickness when close
      if (!best || score < best.score) best = { mask, r, err, score };
    }
  }
  if (!best || best.err > Math.max(15, 0.06 * stated)) return null;
  return { ids: cands.filter((_, i) => best.mask & (1 << i)).map(c => c.label), r: best.r };
}

// The room name printed inside a region (the first all-letters line), or ''.
function roomLabel(t, textAt, lab, label) {
  const it = t.items.find(i => /^[A-Za-z][A-Za-z \-/&]*$/.test(i.str) && lab[textAt(i)] === label);
  return it ? it.str : '';
}

function titleCase(s) { return s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()); }

// Thick line into a mask: stamps a square of half-size r every half pixel.
function stampLine(mask, W, H, a, b, r) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len * 2));
  const R = Math.ceil(r);
  for (let i = 0; i <= n; i++) {
    const cx = a.x + (b.x - a.x) * i / n, cy = a.y + (b.y - a.y) * i / n;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.floor(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.floor(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * W + x] = 1;
  }
}

// ---------------------------------------------------------------------------
// Lining floors up
// ---------------------------------------------------------------------------
// Each floor page is drawn turned to fit the sheet. Floors stacked in one building
// share wall directions, so the candidate turns are those that run a page's walls
// the way the main floor's do, at each quarter turn. When the page's compass agrees
// with one of them (pages from one scan), that one is used as long as its walls
// still land reasonably well; a nearly symmetric floor would otherwise be free to
// turn around. When the compass agrees with none (a floor scanned separately, with
// its own north), the best wall fit is used and the placement is flagged. The page
// is then slid until its walls land on the main floor's walls.
function alignPages(pages) {
  const groups = new Map();
  pages.forEach(p => { const k = p.building || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
  for (const group of groups.values()) {
    const area = p => p.parts.filter(f => f.kind === 'floor').reduce((s, f) => s + f.traced, 0);
    const mains = group.filter(p => p.floor === 'main');
    const ref = (mains.length ? mains : group).reduce((a, p) => (area(p) > area(a) ? p : a));
    for (const p of group) {
      if (p === ref) continue;
      // Whole footprints (floor + excluded rooms) on both sides: a small finished
      // area beside a big storage room fits almost anywhere on its own.
      const built = f => f.kind === 'floor' || f.kind === 'excluded';
      const refGarage = ref.parts.filter(f => f.kind === 'excluded' && f.type === 'garage').map(f => f.points);
      const target = /garage/i.test(p.title) && refGarage.length ? refGarage : ref.parts.filter(built).map(f => f.points);
      const movParts = p.parts.filter(built);
      const c = centroidOf(movParts.flatMap(f => f.points));
      const turnBy = (pts, deg) => { const th = deg * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th); return pts.map(q => ({ x: c.x + (q.x - c.x) * cs - (q.y - c.y) * sn, y: c.y + (q.x - c.x) * sn + (q.y - c.y) * cs })); };
      const norm = a => ((a % 360) + 540) % 360 - 180;
      const compassTurn = ref.compass != null && p.compass != null ? norm(ref.compass - p.compass) : null;
      const am = dominantAngles(movParts.map(f => f.points))[0] ?? 0;
      const turns = new Set();
      dominantAngles(target).forEach(at => { for (let k = 0; k < 4; k++) turns.add(Math.round(norm(at - am + 90 * k) * 10) / 10); });
      if (!turns.size) [0, 90, 180, -90].forEach(v => turns.add(v));
      const tries = [...turns].map(turn => {
        const mov = movParts.map(f => turnBy(f.points, turn));
        return { turn, mov, fit: alignAt(target, mov, 1, null) };
      }).sort((a, b) => b.fit.score - a.fit.score);
      const top = tries[0].fit.score;
      const off = t => (compassTurn == null ? Math.abs(t.turn) : Math.abs(norm(t.turn - compassTurn)));
      const byCompass = compassTurn == null ? null : tries.reduce((a, t) => (off(t) < off(a) ? t : a));
      let pick, rivals;
      if (byCompass && off(byCompass) <= 10 && byCompass.fit.score >= top * 0.85) {
        pick = byCompass; rivals = false;
      } else {
        const close = tries.filter(t => t.fit.score >= top * 0.97);
        pick = close.reduce((a, t) => (off(t) < off(a) ? t : a));
        rivals = compassTurn != null || close.some(t => Math.abs(norm(t.turn - pick.turn)) > 5);
      }
      const fine = alignAt(target, pick.mov, 4, { x: pick.fit.dx, y: pick.fit.dy, r: 2 });
      p.parts.forEach(f => {
        f.points = turnBy(f.points, pick.turn).map(q => ({ x: q.x + fine.dx, y: q.y + fine.dy }));
        f.turned = Math.round(pick.turn);
        f.placement = pick.fit.ambiguous || rivals ? 'check' : 'aligned';
      });
    }
  }
}

// The main wall directions of some outlines, in degrees modulo 90 (length-weighted;
// a second direction is reported when it carries at least a quarter of the wall).
function dominantAngles(polys) {
  const bins = new Float64Array(90);
  polys.forEach(pts => pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) return;
    const ang = ((Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) % 90 + 90) % 90;
    bins[Math.round(ang) % 90] += L;
  }));
  const sm = bins.map((_, i) => bins[(i + 89) % 90] + bins[i] + bins[(i + 1) % 90]);
  const peak = () => sm.reduce((bi, v, i) => (v > sm[bi] ? i : bi), 0);
  const p1 = peak();
  if (!sm[p1]) return [];
  const out = [refine(bins, p1)];
  const first = sm[p1];
  for (let d = -10; d <= 10; d++) sm[(p1 + d + 90) % 90] = 0;
  const p2 = peak();
  if (sm[p2] >= 0.25 * first) out.push(refine(bins, p2));
  return out;
}
function refine(bins, i) {   // length-weighted mean angle around a peak bin
  let s = 0, w = 0;
  for (let d = -2; d <= 2; d++) { const v = bins[(i + d + 90) % 90]; s += (i + d) * v; w += v; }
  return w ? ((s / w) % 90 + 90) % 90 : i;
}

function centroidOf(pts) {
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

// Translation (feet) that lands the moving outlines' walls on the target's walls,
// area overlap breaking ties. Searched at ppf pixels per foot, over every placement
// or within r feet of `around`. Ambiguous when near-best placements spread over
// more than 1.5 ft (a suite shorter than the garage it sits on); the middle of them
// is used then.
function alignAt(target, mov, ppf, around) {
  const tb = bboxOf(target.flat()), mb = bboxOf(mov.flat());
  const mw = mb.x1 - mb.x0, mh = mb.y1 - mb.y0;
  const gx0 = tb.x0 - mw - 1, gy0 = tb.y0 - mh - 1;
  const RW = Math.ceil((tb.x1 - tb.x0 + 2 * mw + 2) * ppf) + 1, RH = Math.ceil((tb.y1 - tb.y0 + 2 * mh + 2) * ppf) + 1;
  const toG = p => ({ x: (p.x - gx0) * ppf, y: (p.y - gy0) * ppf });
  const area = new Uint8Array(RW * RH), edge = new Uint8Array(RW * RH);
  target.forEach(poly => {
    const q = poly.map(toG);
    fillPolygons(area, RW, RH, [q], 'nonzero');
    q.forEach((a, i) => stampLine(edge, RW, RH, a, q[(i + 1) % q.length], 1));
  });
  const MW = Math.ceil(mw * ppf) + 1, MH = Math.ceil(mh * ppf) + 1;
  const M = new Uint8Array(MW * MH);
  const local = p => ({ x: (p.x - mb.x0) * ppf, y: (p.y - mb.y0) * ppf });
  mov.forEach(poly => fillPolygons(M, MW, MH, [poly.map(local)], 'nonzero'));
  const areaPx = [];
  for (let o = 0; o < MW * MH; o++) if (M[o]) areaPx.push((o - (o % MW)) / MW * RW + (o % MW));
  const edgeSet = new Set();
  mov.forEach(poly => poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], A = local(a), B = local(b);
    const n = Math.max(1, Math.ceil(Math.hypot(B.x - A.x, B.y - A.y)));
    for (let k = 0; k <= n; k++) edgeSet.add(Math.min(MH - 1, Math.floor(A.y + (B.y - A.y) * k / n)) * RW + Math.min(MW - 1, Math.floor(A.x + (B.x - A.x) * k / n)));
  }));
  const edgePx = [...edgeSet];
  let ox0 = 0, ox1 = RW - MW, oy0 = 0, oy1 = RH - MH;
  if (around) {
    const cx = Math.round((mb.x0 + around.x - gx0) * ppf), cy = Math.round((mb.y0 + around.y - gy0) * ppf), r = Math.ceil(around.r * ppf);
    ox0 = Math.max(0, cx - r); ox1 = Math.min(RW - MW, cx + r); oy0 = Math.max(0, cy - r); oy1 = Math.min(RH - MH, cy + r);
  }
  const scores = [];
  let best = -1;
  for (let oy = oy0; oy <= oy1; oy++) {
    for (let ox = ox0; ox <= ox1; ox++) {
      const base = oy * RW + ox;
      let e = 0;
      for (let i = 0; i < edgePx.length; i++) e += edge[base + edgePx[i]];
      if (e < best * 0.9) continue;
      let a = 0;
      for (let i = 0; i < areaPx.length; i++) a += area[base + areaPx[i]];
      scores.push([ox, oy, e, e + a / (areaPx.length + 1)]);   // overlap fraction only breaks ties
      if (e > best) best = e;
    }
  }
  const near = scores.filter(([, , e]) => e >= best * 0.95);
  const mx = near.reduce((a, [x]) => a + x, 0) / near.length, my = near.reduce((a, [, y]) => a + y, 0) / near.length;
  const spread = Math.max(...near.map(([x, y]) => Math.hypot(x - mx, y - my))) / ppf;
  const top = scores.reduce((a, c) => (c[3] > a[3] ? c : a));
  const pick = spread > 1.5 ? near.reduce((a, c) => (Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(a[0] - mx, a[1] - my) ? c : a)) : top;
  return { dx: pick[0] / ppf + gx0 - mb.x0, dy: pick[1] / ppf + gy0 - mb.y0, ambiguous: spread > 1.5, score: top[3] };
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
