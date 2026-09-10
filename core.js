// =============================================================================
// CValRSketch core — pure logic shared by desktop and mobile UIs.
// No DOM access, no global state. Each function takes everything it needs
// as arguments and returns plain data. Load via <script src="core.js"> before
// any UI script so these symbols are available as window globals.
// =============================================================================

// ----- Configuration constants -----

const TYPES = {
  living:     { name: 'Enclosed living',    fill: '#f4f0e6', dashed: false },
  finished:   { name: 'Finished basement',  fill: '#eaf4ea', dashed: false },
  unfinished: { name: 'Unfinished (mech)',  fill: 'url(#unfinishedHatch)', dashed: false },
  porch:      { name: 'Open covered porch', fill: 'url(#porchHatch)', dashed: true },
  garage:     { name: 'Garage',             fill: '#efe6dc', dashed: false },
  deck:       { name: 'Open deck',          fill: '#e8dcc8', dashed: true },
  upper:      { name: 'Upper floor area',   fill: '#f0e6f4', dashed: false },
  outbuilding:{ name: 'Outbuilding',        fill: '#e6e0d4', dashed: false },
  barn:       { name: 'Barn',               fill: '#e9d3c4', dashed: false },
  shed:       { name: 'Shed',               fill: '#dfe6d2', dashed: false },
  shop:       { name: 'Shop',               fill: '#d6e0e8', dashed: false },
  carport:    { name: 'Carport',            fill: '#e6ddec', dashed: true },
  misc:       { name: 'Misc / other',       fill: '#ededed', dashed: false },
};

// Building / dwelling grouping for shapes. A shape's `building` is a free label
// from this list; totals subtotal by building. New/legacy shapes default to the
// first entry. Baked in (like TYPES) so it's consistent across files.
const BUILDINGS = ['Dwelling 1', 'Dwelling 2', 'Dwelling 3', 'Outbuildings', 'Other'];
const DEFAULT_BUILDING = BUILDINGS[0];

const DIR_BASE = { r: 0, d: 90, l: 180, u: -90 };

const SETTINGS_DEFAULTS = {
  showSegmentLabels: true,
  showCentroidLabels: true,
  sketchFontScale: 1,   // global multiplier for on-drawing label sizes (dimensions, area, notes)
  ghostDimFloors: [],   // names of non-active floors whose dimension labels should still show
  showVertexDots: true,
  showFloorGhosts: true,
  ghostOpacity: 0.45,
  exportIncludeTitle: true,
  exportIncludeLegend: true,
  exportPageSize: 'auto',  // 'auto' | 'letter-portrait' | 'letter-landscape'
  confirmDelete: true,
  askOnLengthEdit: true,
  defaultLengthEditMode: 'stretch-end',
  snapAngleTo90: false,
  autoCloseFeet: 0.05,
};

const HISTORY_LIMIT = 100;

const EXPORT_PAGE_SIZES = {
  'auto':             null,
  'letter-portrait':  { w: 816,  h: 1056 }, // 8.5×11 in @ 96 DPI
  'letter-landscape': { w: 1056, h: 816 },
};

// ----- Parsing & formatting -----

function parseLength(s) {
  s = String(s).trim();
  if (s.includes('+')) {
    const parts = s.split('+').map(p => p.trim()).filter(Boolean);
    let total = 0;
    for (const p of parts) {
      const v = parseLength(p);
      if (isNaN(v)) return NaN;
      total += v;
    }
    return total;
  }
  if (s.includes("'")) {
    const idx = s.indexOf("'");
    const ftStr = s.slice(0, idx).trim();
    const inStr = s.slice(idx+1).replace('"','').trim();
    const ft = parseFloat(ftStr) || 0;
    const inches = inStr ? parseFloat(inStr) : 0;
    if (isNaN(ft) || isNaN(inches)) return NaN;
    return ft + inches/12;
  }
  if (s.includes('"')) return parseFloat(s.replace('"','')) / 12;
  return parseFloat(s);
}

// Heading of a segment in screen-coord degrees (0=east, 90=south, 180=west, -90=north).
function headingDeg(seg) {
  return Math.atan2(seg.dy, seg.dx) * 180 / Math.PI;
}

function parseSegment(text, priorHeadingDeg = null) {
  // Combined-components syntax: "5'd , 2'l" → one diagonal segment with summed dx/dy.
  // Comma is the separator (legacy '&' still accepted). Each side is parsed as its own
  // cardinal length+direction; angles aren't allowed here.
  if (text.includes(',') || text.includes('&')) {
    const parts = text.split(/[,&]/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) throw new Error(`"${text}": ',' must combine two or more length-direction pairs`);
    let dx = 0, dy = 0;
    for (const part of parts) {
      const sub = parseSegment(part);
      if (sub.autoExtend) throw new Error(`"${text}": ',' requires an explicit length on every part`);
      if (sub.angle) throw new Error(`"${text}": ',' parts can't have angles — use a single diagonal segment instead`);
      dx += sub.dx;
      dy += sub.dy;
    }
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) throw new Error(`"${text}": combined vector is zero`);
    const dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'r' : 'l') : (dy >= 0 ? 'd' : 'u');
    return { length, dir, angle: 0, dx, dy, raw: text.trim() };
  }

  let s = text.trim().toLowerCase()
    .replace(/→/g,' r').replace(/←/g,' l').replace(/↑/g,' u').replace(/↓/g,' d')
    .replace(/\bright\b/g, 'r').replace(/\bleft\b/g, 'l')   // accept full direction words
    .replace(/\bup\b/g, 'u').replace(/\bdown\b/g, 'd')
    .replace(/\s*\+\s*/g, '+')              // collapse spaces around + so "2'6 + 3'0" → "2'6+3'0"
    .replace(/([\d'"])([rlud])/g, '$1 $2')  // split length from direction: "3'0r" → "3'0 r"
    .replace(/([rlud])(-?\d)/g, '$1 $2');   // split direction from angle: "r90" → "r 90"
  const tokens = s.split(/\s+/).filter(Boolean);
  // Auto-extend: just a direction with no length → snap to next aligned vertex (resolved by caller).
  if (tokens.length === 1 && tokens[0] in DIR_BASE) {
    return { autoExtend: true, dir: tokens[0], raw: text.trim() };
  }
  if (tokens.length < 2) throw new Error(`"${text}": need length and direction`);
  // Implicit combined components: "5'd 3'l" (or "5'd3'l") → one diagonal segment.
  // Triggers when tokens are pairs of (length, direction) with no angle.
  if (tokens.length >= 4 && tokens.length % 2 === 0) {
    let allPairs = true;
    for (let i = 0; i < tokens.length; i += 2) {
      const len = parseLength(tokens[i]);
      if (!(len > 0) || !(tokens[i+1] in DIR_BASE)) { allPairs = false; break; }
    }
    if (allPairs) {
      let dx = 0, dy = 0;
      for (let i = 0; i < tokens.length; i += 2) {
        const len = parseLength(tokens[i]);
        const a = DIR_BASE[tokens[i+1]] * Math.PI / 180;
        dx += Math.cos(a) * len;
        dy += Math.sin(a) * len;
      }
      const length = Math.hypot(dx, dy);
      if (!(length > 0)) throw new Error(`"${text}": combined vector is zero`);
      const dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'r' : 'l') : (dy >= 0 ? 'd' : 'u');
      return { length, dir, angle: 0, dx, dy, raw: text.trim() };
    }
  }
  const length = parseLength(tokens[0]);
  if (!(length > 0)) throw new Error(`"${text}": invalid length`);
  const dir = tokens[1];
  if (!(dir in DIR_BASE)) throw new Error(`"${text}": direction must be r, l, u, or d`);
  const userAngle = tokens[2] !== undefined ? parseFloat(tokens[2]) : 0;
  if (isNaN(userAngle)) throw new Error(`"${text}": invalid angle`);
  // Angle interpretation:
  //  - r/l with explicit angle AND a known prior heading → relative turn from the
  //    previous segment (r = turn right/CW, l = turn left/CCW). Matches how you'd
  //    walk a perimeter: "after going east, l 45 = NE; r 45 = SE".
  //  - Otherwise → degrees CW from the cardinal base (DIR_BASE).
  const relative = tokens[2] !== undefined && priorHeadingDeg !== null && (dir === 'r' || dir === 'l');
  const totalDeg = relative
    ? priorHeadingDeg + (dir === 'r' ? userAngle : -userAngle)
    : DIR_BASE[dir] + userAngle;
  const total = totalDeg * Math.PI / 180;
  return {
    length, dir, angle: userAngle,
    dx: Math.cos(total) * length,
    dy: Math.sin(total) * length,
    raw: text.trim()
  };
}

function formatLength(ft) {
  if (ft < 0) return '-' + formatLength(-ft);
  const whole = Math.floor(ft);
  const inches = Math.round((ft - whole) * 12);
  if (inches === 12) return `${whole+1}'0"`;
  return `${whole}'${inches}"`;
}

// dx, dy = vector FROM pen end TO start (what a closing segment would travel).
function formatGapBreakdown(dx, dy) {
  const tol = 1/24; // ~1/2"
  const parts = [];
  if (Math.abs(dx) > tol) parts.push(`${formatLength(Math.abs(dx))} ${dx > 0 ? 'right' : 'left'}`);
  if (Math.abs(dy) > tol) parts.push(`${formatLength(Math.abs(dy))} ${dy > 0 ? 'down' : 'up'}`);
  return parts.length ? parts.join(' + ') : 'aligned';
}

// ----- Geometry -----

// Returns the sequence of points the pen visits, including start.
// `start` is { x, y }; `segs` is an array of { dx, dy, ... }.
function pathPoints(segs, start) {
  const pts = [{ ...start }];
  let x = start.x, y = start.y;
  for (const s of segs) { x += s.dx; y += s.dy; pts.push({ x, y }); }
  return pts;
}

function polygonArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i+1];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function polygonCentroid(pts) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i+1];
    const cross = p1.x * p2.y - p2.x * p1.y;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
    a += cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return { x: pts[0].x, y: pts[0].y };
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function wallVector(shape, i) {
  const a = shape.points[i], b = shape.points[i+1];
  return { x: b.x - a.x, y: b.y - a.y };
}
function wallLength(shape, i) {
  const v = wallVector(shape, i);
  return Math.hypot(v.x, v.y);
}
function wallUnit(shape, i) {
  const v = wallVector(shape, i);
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function findOpposingWall(shape, wallIdx) {
  const unit = wallUnit(shape, wallIdx);
  const n = shape.points.length - 1;
  let best = null, bestScore = -0.95; // require fairly antiparallel
  for (let j = 0; j < n; j++) {
    if (j === wallIdx) continue;
    const other = wallUnit(shape, j);
    const dot = unit.x * other.x + unit.y * other.y;
    if (dot < bestScore) { bestScore = dot; best = j; }
  }
  return best;
}

function rebuildSegments(shape) {
  shape.segments = [];
  for (let i = 0; i < shape.points.length - 1; i++) {
    const a = shape.points[i], b = shape.points[i+1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx) * 180 / Math.PI;
    const bases = [['r', 0], ['d', 90], ['l', 180], ['u', -90]];
    let best = bases[0], bestDiff = Infinity;
    for (const [d, ba] of bases) {
      let diff = ((theta - ba + 540) % 360) - 180;
      if (Math.abs(diff) < Math.abs(bestDiff)) { bestDiff = diff; best = [d, ba]; }
    }
    shape.segments.push({
      length, dir: best[0], angle: bestDiff, dx, dy,
      raw: `${formatLength(length)} ${best[0]}${Math.abs(bestDiff) > 0.5 ? ' ' + bestDiff.toFixed(1) : ''}`
    });
  }
}

function syncClosure(shape, movedIdx) {
  // If we moved the first vertex, copy to last (or vice versa).
  const n = shape.points.length;
  if (movedIdx === 0) shape.points[n-1] = { ...shape.points[0] };
  else if (movedIdx === n-1) shape.points[0] = { ...shape.points[n-1] };
}

// ----- Edit operations -----

function setWallLength(shape, wallIdx, newLength, mode) {
  const unit = wallUnit(shape, wallIdx);
  const curLen = wallLength(shape, wallIdx);
  const delta = newLength - curLen;
  const startIdx = wallIdx;
  const endIdx = wallIdx + 1;

  if (mode === 'stretch-end') {
    shape.points[endIdx].x += unit.x * delta;
    shape.points[endIdx].y += unit.y * delta;
    syncClosure(shape, endIdx);
  } else if (mode === 'stretch-symmetric') {
    shape.points[startIdx].x -= unit.x * delta/2;
    shape.points[startIdx].y -= unit.y * delta/2;
    shape.points[endIdx].x += unit.x * delta/2;
    shape.points[endIdx].y += unit.y * delta/2;
    syncClosure(shape, startIdx); syncClosure(shape, endIdx);
  } else if (mode === 'maintain-rect') {
    const opp = findOpposingWall(shape, wallIdx);
    if (opp === null) {
      setWallLength(shape, wallIdx, newLength, 'stretch-end');
      return;
    }
    // Move end of this wall AND start of opposing wall by delta along this unit.
    shape.points[endIdx].x += unit.x * delta;
    shape.points[endIdx].y += unit.y * delta;
    shape.points[opp].x += unit.x * delta;
    shape.points[opp].y += unit.y * delta;
    syncClosure(shape, endIdx); syncClosure(shape, opp);
  }
  rebuildSegments(shape);
}

function moveWallByVector(shape, wallIdx, vx, vy) {
  const startIdx = wallIdx;
  const endIdx = wallIdx + 1;
  shape.points[startIdx].x += vx;
  shape.points[startIdx].y += vy;
  shape.points[endIdx].x += vx;
  shape.points[endIdx].y += vy;
  syncClosure(shape, startIdx); syncClosure(shape, endIdx);
  rebuildSegments(shape);
}

function moveVertexByVector(shape, vIdx, vx, vy) {
  shape.points[vIdx].x += vx;
  shape.points[vIdx].y += vy;
  syncClosure(shape, vIdx);
  rebuildSegments(shape);
}

function insertVertexOnWall(shape, wallIdx, t = 0.5) {
  const a = shape.points[wallIdx], b = shape.points[wallIdx+1];
  const newP = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  shape.points.splice(wallIdx + 1, 0, newP);
  rebuildSegments(shape);
}

// Returns true on success, false if the caller should bail (shape too small).
// Caller is responsible for confirming via UI; this function does not prompt.
function deleteVertex(shape, vIdx) {
  const n = shape.points.length;
  if (n <= 4) return false;
  // Handle closing vertex case
  if (vIdx === 0 || vIdx === n - 1) {
    shape.points.splice(n - 1, 1);
    shape.points.splice(0, 1);
    shape.points.push({ ...shape.points[0] });
  } else {
    shape.points.splice(vIdx, 1);
  }
  rebuildSegments(shape);
  return true;
}

// ----- Auto-extend (snap to next aligned vertex) -----
// Returns sorted candidates (closest first), each with { along, point, segment }.
function findAlignedCandidates(priorSegments, dir, start, shapes) {
  let x = start.x, y = start.y;
  const pts = [{ x, y }];
  for (const s of priorSegments) { x += s.dx; y += s.dy; pts.push({ x, y }); }
  const pen = pts[pts.length - 1];

  const rad = DIR_BASE[dir] * Math.PI / 180;
  const dx = Math.cos(rad), dy = Math.sin(rad);
  const tol = 0.05;
  const minForward = 0.01;

  const seen = new Set();
  const out = [];
  function add(p) {
    const key = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    if (seen.has(key)) return;
    const along = (p.x - pen.x) * dx + (p.y - pen.y) * dy;
    const perp = Math.abs((p.x - pen.x) * (-dy) + (p.y - pen.y) * dx);
    if (along > minForward && perp < tol) {
      seen.add(key);
      out.push({
        along,
        point: { x: p.x, y: p.y },
        segment: { length: along, dir, angle: 0, dx: dx * along, dy: dy * along, raw: `${formatLength(along)} ${dir} (auto)` },
      });
    }
  }
  for (const sh of shapes) for (let i = 0; i < sh.points.length - 1; i++) add(sh.points[i]);
  for (const p of pts) add(p);

  // Perpendicular-projection candidates, ALWAYS merged in (not just a fallback).
  // A landing point where walking in `dir` brings the pen's MOVING coordinate in line
  // with another vertex — i.e. "walk up until my Y matches that vertex's Y". This gives
  // the nearer alignment options (e.g. line up with each step of a staircase) in addition
  // to any vertex sitting directly on the ray, so there's more than one candidate to
  // cycle through. On-ray hits already added above are de-duped by landing-point key.
  const isHoriz = Math.abs(dx) > Math.abs(dy);   // r/l move X; u/d move Y
  function addProj(p) {
    const perp = Math.abs((p.x - pen.x) * (-dy) + (p.y - pen.y) * dx);
    if (perp < tol) return;                      // already added as an on-ray candidate
    const landing = isHoriz ? { x: p.x, y: pen.y } : { x: pen.x, y: p.y };
    const along = (landing.x - pen.x) * dx + (landing.y - pen.y) * dy;
    if (along <= minForward) return;             // must be a forward walk in `dir`
    const key = `${landing.x.toFixed(3)},${landing.y.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      along,
      point: landing,
      segment: { length: along, dir, angle: 0, dx: dx * along, dy: dy * along, raw: `${formatLength(along)} ${dir} (align)` },
    });
  }
  for (const sh of shapes) for (let i = 0; i < sh.points.length - 1; i++) addProj(sh.points[i]);
  for (const p of pts) addProj(p);

  out.sort((a, b) => a.along - b.along);
  return out;
}
