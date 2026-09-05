import { PAGE_PADDING } from '../data/initialState';

// The footer is fixed/locked (never moved or resized by the user), so its
// top edge — where every other item's reserved bottom space begins — is
// just its own stored `y`, no DOM measurement needed. Falls back to the
// page's own bottom (i.e. no additional restriction) if a template were
// ever missing it.
export function getFooterTop(items, page) {
  const footer = items.find((i) => i.type === 'footer');
  return footer ? footer.y : page.height;
}

// The valid position/size envelope for an item: shapes may sit flush
// against the true page edge (0/page.width — required for the rail
// behavior) and content items must stay at least PAGE_PADDING away from
// every edge — EXCEPT at the bottom, where the footer's own top edge
// applies instead whenever it's the more restrictive of the two. Every
// kind is excluded from the footer's strip, including shapes: a decorative
// rail is allowed flush against the true page edge everywhere else, but
// not through the footer specifically.
export function getItemBounds(item, page, footerTop = page.height) {
  const bottomLimit = Math.min(page.height, footerTop);
  if (item.kind === 'shape') {
    return { minX: 0, maxX: page.width, minY: 0, maxY: bottomLimit };
  }
  return {
    minX: PAGE_PADDING,
    maxX: page.width - PAGE_PADDING,
    minY: PAGE_PADDING,
    maxY: Math.min(page.height - PAGE_PADDING, bottomLimit),
  };
}

// Rotate a vector (dx,dy) by `degrees` around the origin.
export function rotateVector(dx, dy, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

// Snap a rotate-handle angle to the nearest straight orientation (0/90/180/270,
// plus their negative/wrap-around equivalents) when within `tolerance` degrees
// of it, so dragging past a "straight" pose feels/looks intentional.
const SNAP_TARGETS = [-360, -270, -180, -90, 0, 90, 180, 270, 360];

export function snapRotation(degrees, tolerance = 5) {
  let closest = degrees;
  let closestDist = Infinity;
  for (const target of SNAP_TARGETS) {
    const dist = Math.abs(degrees - target);
    if (dist < closestDist) {
      closestDist = dist;
      closest = target;
    }
  }
  if (closestDist <= tolerance) return { value: closest, snapped: true };
  return { value: degrees, snapped: false };
}

// The 8 resize handles shared by every canvas item (shape or content).
// fx/fy locate the handle on the item's own unrotated box in [0,1]
// (0 = left/top edge, 1 = right/bottom edge, 0.5 = centered on that axis —
// used by edge handles to mean "this axis doesn't move").
export const RESIZE_HANDLES = [
  { key: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' },
  { key: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { key: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' },
  { key: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { key: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' },
  { key: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { key: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' },
  { key: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' },
];

// Compute the new {x,y,width,height} for a rotated, resizable box given a
// drag of one of its 8 handles. `start` is the box's geometry as it was
// AT THE START of the drag (never mutated mid-gesture); `handle` is one of
// RESIZE_HANDLES; `dx,dy` is the cumulative mouse movement in page-space
// pixels since the drag began.
//
// Rotation pivots around the box's own center (the CSS default
// transform-origin), so resizing from a corner/edge while keeping the
// OPPOSITE corner/edge visually fixed has to happen in the box's own
// unrotated local space: rotate the mouse delta into that local space,
// move the dragged point there while the fixed point stays put, derive
// the new width/height/center from those two local points, then rotate
// the resulting center back out to page space.
export function resizeRotatedBox(start, handle, dx, dy, minSize = 16) {
  const { x, y, width, height, rotation = 0 } = start;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const local = rotateVector(dx, dy, -rotation);

  let newWidth = width;
  let newHeight = height;
  let centerOffsetX = 0;
  let centerOffsetY = 0;

  if (handle.fx !== 0.5) {
    const fixedLocalX = (1 - handle.fx - 0.5) * width;
    const draggedLocalX = (handle.fx - 0.5) * width + local.x;
    const rawWidth = draggedLocalX - fixedLocalX;
    newWidth = Math.max(minSize, Math.abs(rawWidth));
    const sign = rawWidth < 0 ? -1 : 1;
    const clampedDraggedX = fixedLocalX + sign * newWidth;
    centerOffsetX = (fixedLocalX + clampedDraggedX) / 2;
  }

  if (handle.fy !== 0.5) {
    const fixedLocalY = (1 - handle.fy - 0.5) * height;
    const draggedLocalY = (handle.fy - 0.5) * height + local.y;
    const rawHeight = draggedLocalY - fixedLocalY;
    newHeight = Math.max(minSize, Math.abs(rawHeight));
    const sign = rawHeight < 0 ? -1 : 1;
    const clampedDraggedY = fixedLocalY + sign * newHeight;
    centerOffsetY = (fixedLocalY + clampedDraggedY) / 2;
  }

  const worldOffset = rotateVector(centerOffsetX, centerOffsetY, rotation);
  const newCx = cx + worldOffset.x;
  const newCy = cy + worldOffset.y;

  return {
    x: newCx - newWidth / 2,
    y: newCy - newHeight / 2,
    width: newWidth,
    height: newHeight,
  };
}

// Simple v1 edge-alignment snap: compare a dragged item's left/center/right
// (or top/center/bottom) against a flat list of candidate edges — other
// items' edges, page edges, whatever the caller supplies — and if the
// closest pair is within `tolerance`, return the small delta that would
// align them exactly.
export function snapAxis(pos, size, otherEdges, tolerance = 4) {
  const points = [pos, pos + size / 2, pos + size];
  let best = 0;
  let bestDist = tolerance;
  points.forEach((p) => {
    otherEdges.forEach((oe) => {
      const d = oe - p;
      if (Math.abs(d) <= bestDist) {
        bestDist = Math.abs(d);
        best = d;
      }
    });
  });
  return best;
}

// How close (px) a candidate has to be for a full-span alignment guide line
// to appear — same tolerance snapAxis already uses for the actual snap, so
// a guide only ever shows for an alignment that's actually engaged.
const GUIDE_TOLERANCE = 4;
// How far away (px) a neighboring item can be for its gap to still be worth
// showing as a live distance label — beyond this it's not "nearby" in any
// visually useful sense.
const DISTANCE_LABEL_RANGE = 160;

// The single CLOSEST alignment on this axis — among every one of the
// box's own left/center/right (or top/center/bottom) points that's within
// `tolerance` of another item's, keep only the nearest match by actual
// pixel distance (Prompt 14: rendering every match within tolerance, like
// this used to, let a dense cluster show up to 8 simultaneous guide
// elements at once — one authoritative line per axis reads as information
// instead of clutter).
function nearestAlignment(pos, size, otherPoints, tolerance = GUIDE_TOLERANCE) {
  const points = [pos, pos + size / 2, pos + size];
  let best = null;
  let bestDist = tolerance;
  points.forEach((p) => {
    otherPoints.forEach((op) => {
      const d = Math.abs(op - p);
      if (d <= bestDist) {
        bestDist = d;
        best = op;
      }
    });
  });
  return best;
}

// Smart guides for a box mid-drag/resize against every OTHER item (shapes
// included — aligning text to a decorative rail's edge is a real case).
// Two independent things, both purely visual/informational, and both
// capped to at most ONE per axis (Prompt 14) — a dense cluster used to be
// able to show up to 8 simultaneous elements (multiple lines + up to 4
// gap labels), which read as clutter rather than information:
//   - `vertical`/`horizontal`: at most one page-spanning line per axis —
//     whichever of this box's own edges/center is CLOSEST to another
//     item's, not every alignment within tolerance — separate from the
//     page-boundary edge highlight, which is its own system (see
//     clampToPage/clampResizeToPage).
//   - `labels`: at most one live pixel-gap readout per axis — the nearer
//     of the two candidate neighbors (e.g. left vs right) on each axis,
//     shown independent of whether a snap is engaged, and only within
//     DISTANCE_LABEL_RANGE ("close enough to be worth mentioning").
export function computeGuides(box, others) {
  const otherXPoints = others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width]);
  const otherYPoints = others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height]);
  const nearestV = nearestAlignment(box.x, box.width, otherXPoints);
  const nearestH = nearestAlignment(box.y, box.height, otherYPoints);
  const vertical = nearestV === null ? [] : [nearestV];
  const horizontal = nearestH === null ? [] : [nearestH];

  const rowNeighbors = others.filter((o) => o.y < box.y + box.height && o.y + o.height > box.y);
  const colNeighbors = others.filter((o) => o.x < box.x + box.width && o.x + o.width > box.x);

  let leftGap = null;
  let rightGap = null;
  rowNeighbors.forEach((o) => {
    if (o.x + o.width <= box.x) {
      const gap = box.x - (o.x + o.width);
      if (gap <= DISTANCE_LABEL_RANGE && (!leftGap || gap < leftGap)) leftGap = gap;
    }
    if (o.x >= box.x + box.width) {
      const gap = o.x - (box.x + box.width);
      if (gap <= DISTANCE_LABEL_RANGE && (!rightGap || gap < rightGap)) rightGap = gap;
    }
  });

  let topGap = null;
  let bottomGap = null;
  colNeighbors.forEach((o) => {
    if (o.y + o.height <= box.y) {
      const gap = box.y - (o.y + o.height);
      if (gap <= DISTANCE_LABEL_RANGE && (!topGap || gap < topGap)) topGap = gap;
    }
    if (o.y >= box.y + box.height) {
      const gap = o.y - (box.y + box.height);
      if (gap <= DISTANCE_LABEL_RANGE && (!bottomGap || gap < bottomGap)) bottomGap = gap;
    }
  });

  // At most one label per axis — whichever side (left/right, top/bottom)
  // is actually nearer, not both at once.
  const labels = [];
  if (leftGap !== null && (rightGap === null || leftGap <= rightGap)) {
    labels.push({ x: box.x - leftGap / 2, y: box.y + box.height / 2, text: `${Math.round(leftGap)}px` });
  } else if (rightGap !== null) {
    labels.push({ x: box.x + box.width + rightGap / 2, y: box.y + box.height / 2, text: `${Math.round(rightGap)}px` });
  }
  if (topGap !== null && (bottomGap === null || topGap <= bottomGap)) {
    labels.push({ x: box.x + box.width / 2, y: box.y - topGap / 2, text: `${Math.round(topGap)}px` });
  } else if (bottomGap !== null) {
    labels.push({ x: box.x + box.width / 2, y: box.y + box.height + bottomGap / 2, text: `${Math.round(bottomGap)}px` });
  }

  return { vertical, horizontal, labels };
}

// ---------- Content-vs-content collision (Prompt 12) ----------
//
// Content items may never overlap. Each item claims a 1px margin on every
// side that no OTHER item's own box may cross, so when two items are as
// close as the constraint allows, there's 1px (mover) + 1px (neighbor) =
// 2px of real empty space between their actual borders. Shapes are exempt
// — same rail exception as the Prompt 5 edge-padding rule, since a
// decorative rail is meant to sit flush against/behind content, not be
// pushed away by it.
export const COLLISION_MARGIN = 1;

// The axis-aligned box that encloses a (possibly rotated) item — two
// rotated items can visually overlap well before their unrotated x/y/
// width/height boxes would, so collision is always tested against this,
// never the raw box. Rotation pivots around the box's own center, same
// convention resizeRotatedBox already uses.
export function rotatedBoundingBox(box) {
  const { x, y, width, height, rotation = 0 } = box;
  if (!rotation) return { minX: x, maxX: x + width, minY: y, maxY: y + height };
  const cx = x + width / 2;
  const cy = y + height / 2;
  const corners = [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ].map(([lx, ly]) => rotateVector(lx, ly, rotation));
  const xs = corners.map((c) => cx + c.x);
  const ys = corners.map((c) => cy + c.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// Precomputes every blocking neighbor's rotated bounding box, each already
// expanded by its own margin — the one-time-per-gesture setup step, so the
// per-frame resolve functions below just do plain interval math.
export function collisionBoxes(items, margin = COLLISION_MARGIN) {
  return items.map((item) => {
    const bbox = rotatedBoundingBox(item);
    return { minX: bbox.minX - margin, maxX: bbox.maxX + margin, minY: bbox.minY - margin, maxY: bbox.maxY + margin };
  });
}

// `epsilon` shrinks `a` by that much on every side before testing — used
// only for the "is this box already invalid" defensive checks below, so a
// pair of items sitting at (or a hair under) the exact collision margin —
// which a text item's live-measured effective size (Prompt 14) can
// legitimately land on, sub-pixel rendering being what it is — doesn't
// register as a violation and freeze every future gesture on it. The
// bisections that do the actual resolving stay at epsilon 0: precision
// there isn't the problem, only the binary "did the gesture start valid"
// gate is.
function boxesOverlap(a, b, epsilon = 0) {
  return (
    a.minX + epsilon < b.maxX && a.maxX - epsilon > b.minX && a.minY + epsilon < b.maxY && a.maxY - epsilon > b.minY
  );
}
const COLLISION_EPSILON = 1;

// How far this (unrotated) item's own left/right/top/bottom edge is from
// the nearest other item's (possibly rotated) bounding box in that exact
// direction — Infinity when nothing's in the way. Used to shrink a resize
// handle's fixed outward offset only when a neighbor is actually close
// enough to need it (Prompt 14's audit finding: at the Prompt 12 minimum
// 2px gap, a handle's full fixed offset visually oversat onto the
// neighbor) — everywhere else, the handle keeps its normal offset. Only
// meaningful for an unrotated item: "left/right/top/bottom" stops being a
// well-defined pair of directions once the item itself is rotated, so
// CanvasItem only calls this for rotation === 0 and falls back to the
// fixed offset otherwise.
export function edgeClearance(item, others) {
  const bbox = { minX: item.x, maxX: item.x + item.width, minY: item.y, maxY: item.y + item.height };
  let left = Infinity;
  let right = Infinity;
  let top = Infinity;
  let bottom = Infinity;
  others.forEach((o) => {
    const obb = rotatedBoundingBox(o);
    const yOverlap = bbox.minY < obb.maxY && bbox.maxY > obb.minY;
    const xOverlap = bbox.minX < obb.maxX && bbox.maxX > obb.minX;
    if (yOverlap) {
      if (obb.maxX <= bbox.minX) left = Math.min(left, bbox.minX - obb.maxX);
      if (obb.minX >= bbox.maxX) right = Math.min(right, obb.minX - bbox.maxX);
    }
    if (xOverlap) {
      if (obb.maxY <= bbox.minY) top = Math.min(top, bbox.minY - obb.maxY);
      if (obb.minY >= bbox.maxY) bottom = Math.min(bottom, obb.minY - bbox.maxY);
    }
  });
  return { left, right, top, bottom };
}

// Cascading push, one page-aligned axis at a time, in "forward" coordinate
// space: the advancing edge starts at `startFront` (a position this same
// edge already validly occupied) and wants to reach `desiredFront`
// (`desiredFront > startFront` — callers of `cascadeEdge` below negate
// coordinates for the decreasing-direction case so this never has to know
// which real axis/sign it's working in). `chain` is every candidate
// neighbor that could be in the way, as `{ id, near, far, locked }` in
// that same forward space (near < far), restricted by the caller to
// whichever ones share the relevant cross-axis band. `boundary` is the
// genuinely immovable cap in this space (a page/footer edge). `gap` is
// the real minimum separation to maintain between raw (unexpanded) boxes
// (2 * COLLISION_MARGIN — 1px claimed by each side).
//
// Single left-to-right sweep: everything from `startFront` on is already
// non-overlapping (the gesture's own invariant), so once a candidate
// clears (its near edge is `gap` or more ahead of the current occupied
// front), everything further along the sorted chain clears too — nothing
// to backtrack. A locked item can't move, so the sweep stops dead there;
// otherwise the candidate gets pushed to sit exactly `gap` ahead of
// whatever's already occupying the front, and the front advances to its
// far edge for the next link. If the fully-pushed chain would overshoot
// the wall it eventually hits (locked item or boundary), every push
// (mover included) is reduced by the same overshoot — a uniform backward
// slide of the whole rigid chain, which — because the ORIGINAL, pre-
// gesture arrangement was already non-overlapping — can never push
// anything to less than zero (see the proof in the prompt 16 notes: the
// pre-gesture gap between any two chain links, summed along the chain,
// already covers exactly this compression).
export function cascadePush1D(startFront, desiredFront, chain, boundary, gap) {
  const shifts = new Map();
  if (desiredFront <= startFront) return { front: desiredFront, shifts };
  const sorted = chain.filter((it) => it.near >= startFront).sort((a, b) => a.near - b.near);
  let cursor = desiredFront;
  let jammedAt = null;
  for (const it of sorted) {
    if (it.near >= cursor + gap) break; // sorted ascending — nothing further is in the way either
    if (it.locked) {
      jammedAt = it.near - gap;
      break;
    }
    const size = it.far - it.near;
    shifts.set(it.id, cursor + gap - it.near);
    cursor = cursor + gap + size;
  }
  const wallLimit = jammedAt !== null ? jammedAt : boundary;
  if (cursor > wallLimit) {
    const overshoot = cursor - wallLimit;
    for (const [id, amt] of shifts) shifts.set(id, amt - overshoot);
    return { front: desiredFront - overshoot, shifts };
  }
  return { front: desiredFront, shifts };
}

// Wraps cascadePush1D for one real page-aligned axis ('x' or 'y') and
// direction (`dir` = +1/-1, whichever way the advancing edge is
// traveling) — converts real coordinates to/from the forward space
// cascadePush1D expects (a plain identity for dir>0, negated for dir<0,
// same mirror trick used throughout), and filters `neighbors` (plain
// {id,x,y,width,height,rotation,locked} content items) down to whichever
// ones actually share the perpendicular band the moving edge is sweeping
// through. Returns `{ edge, pushed }`: the edge's actual final real
// coordinate, and a Map<id, delta> of by how much (signed, this axis
// only) each neighbor must translate.
function cascadeEdge(axis, dir, startEdge, desiredEdge, crossMin, crossMax, neighbors, boundaryEdge, gap) {
  const chain = [];
  neighbors.forEach((n) => {
    const nb = rotatedBoundingBox(n);
    const nCrossMin = axis === 'x' ? nb.minY : nb.minX;
    const nCrossMax = axis === 'x' ? nb.maxY : nb.maxX;
    if (crossMin >= nCrossMax || crossMax <= nCrossMin) return; // not in the moving edge's path
    const rawNear = axis === 'x' ? nb.minX : nb.minY;
    const rawFar = axis === 'x' ? nb.maxX : nb.maxY;
    chain.push(
      dir > 0
        ? { id: n.id, near: rawNear, far: rawFar, locked: !!n.locked }
        : { id: n.id, near: -rawFar, far: -rawNear, locked: !!n.locked }
    );
  });
  const startFront = dir > 0 ? startEdge : -startEdge;
  const desiredFront = dir > 0 ? desiredEdge : -desiredEdge;
  const boundary = dir > 0 ? boundaryEdge : -boundaryEdge;
  const { front, shifts } = cascadePush1D(startFront, desiredFront, chain, boundary, gap);
  const edge = dir > 0 ? front : -front;
  const pushed = new Map();
  shifts.forEach((amt, id) => pushed.set(id, amt * dir));
  return { edge, pushed };
}

// Per-axis cascading-push resolution for a MOVE: X is resolved first
// (using the last valid Y as the reference row), then Y is resolved using
// the just-resolved X as the reference column — same sequential "slide
// along the wall" order the old hard-stop version used, just letting each
// axis push a chain of neighbors (see cascadePush1D) instead of freezing
// at first contact. `lastValid` must be a position this same item was
// already legally at (no overlap) — the gesture's gradually-updated
// last-good frame, not the drag's original start, so movement stays
// continuous. `neighbors` are plain content items (not pre-expanded
// boxes — the cascade needs each one's own id/locked flag to know who it
// can push and by how much). `bounds` is this item's own page/footer
// envelope (see getItemBounds) — the chain's outermost, genuinely
// immovable limit when nothing locked stops it first.
export function resolveMoveCollision(lastValid, desired, size, rotation, neighbors, bounds, margin = COLLISION_MARGIN) {
  if (!neighbors.length) return { x: desired.x, y: desired.y, pushed: new Map() };
  // Local (pre-translation) bbox offsets — rotation/size don't change
  // during a move, so this is the same shape at every (x, y), just shifted.
  const local = rotatedBoundingBox({ x: 0, y: 0, width: size.width, height: size.height, rotation });
  const gap = margin * 2;
  const pushedX = new Map();
  const pushedY = new Map();

  let x = desired.x;
  if (desired.x !== lastValid.x) {
    const dir = desired.x > lastValid.x ? 1 : -1;
    const rowMinY = lastValid.y + local.minY;
    const rowMaxY = lastValid.y + local.maxY;
    const startEdge = dir > 0 ? lastValid.x + local.maxX : lastValid.x + local.minX;
    const desiredEdge = dir > 0 ? desired.x + local.maxX : desired.x + local.minX;
    const boundaryEdge = dir > 0 ? bounds.maxX : bounds.minX;
    const { edge, pushed } = cascadeEdge('x', dir, startEdge, desiredEdge, rowMinY, rowMaxY, neighbors, boundaryEdge, gap);
    x = dir > 0 ? edge - local.maxX : edge - local.minX;
    pushed.forEach((v, id) => pushedX.set(id, v));
  }

  let y = desired.y;
  if (desired.y !== lastValid.y) {
    const dir = desired.y > lastValid.y ? 1 : -1;
    const colMinX = x + local.minX;
    const colMaxX = x + local.maxX;
    const shiftedNeighbors = neighbors.map((n) => (pushedX.has(n.id) ? { ...n, x: n.x + pushedX.get(n.id) } : n));
    const startEdge = dir > 0 ? lastValid.y + local.maxY : lastValid.y + local.minY;
    const desiredEdge = dir > 0 ? desired.y + local.maxY : desired.y + local.minY;
    const boundaryEdge = dir > 0 ? bounds.maxY : bounds.minY;
    const { edge, pushed } = cascadeEdge('y', dir, startEdge, desiredEdge, colMinX, colMaxX, shiftedNeighbors, boundaryEdge, gap);
    y = dir > 0 ? edge - local.maxY : edge - local.minY;
    pushed.forEach((v, id) => pushedY.set(id, v));
  }

  const pushed = new Map();
  neighbors.forEach((n) => {
    const dx = pushedX.get(n.id) || 0;
    const dy = pushedY.get(n.id) || 0;
    if (dx || dy) pushed.set(n.id, { x: n.x + dx, y: n.y + dy });
  });
  return { x, y, pushed };
}

// Hard-stop fallback for a ROTATED resize's growing edge: cascading push
// assumes an advancing edge sweeps a page-aligned band, which no longer
// holds once growth happens along a rotated local axis (widening a
// rotated box moves BOTH its AABB's X and Y extents at once) — so a
// rotated item keeps the original bisection-to-first-contact behavior
// instead (same "opposite edge stays fixed" contract, just capped rather
// than cascaded). `box` is the frame's current (possibly X-already-
// resolved) working box.
function hardStopResizeAxis(axis, startBox, box, neighbors, margin) {
  const neighborBoxes = collisionBoxes(neighbors, margin);
  const collides = (b, epsilon = 0) => {
    const bbox = rotatedBoundingBox(b);
    const expanded = { minX: bbox.minX - margin, maxX: bbox.maxX + margin, minY: bbox.minY - margin, maxY: bbox.maxY + margin };
    return neighborBoxes.some((n) => boxesOverlap(expanded, n, epsilon));
  };
  const testAt = (t) =>
    axis === 'x'
      ? {
          x: startBox.x + (box.x - startBox.x) * t,
          y: startBox.y,
          width: startBox.width + (box.width - startBox.width) * t,
          height: startBox.height,
          rotation: box.rotation,
        }
      : {
          x: box.x,
          y: startBox.y + (box.y - startBox.y) * t,
          width: box.width,
          height: startBox.height + (box.height - startBox.height) * t,
          rotation: box.rotation,
        };
  const start = axis === 'x' ? { x: startBox.x, width: startBox.width } : { y: startBox.y, height: startBox.height };
  const end = axis === 'x' ? { x: box.x, width: box.width } : { y: box.y, height: box.height };
  if (collides(testAt(0), COLLISION_EPSILON)) return start;
  if (!collides(testAt(1))) return end;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (collides(testAt(t))) hi = t;
    else lo = t;
  }
  const r = testAt(lo);
  return axis === 'x' ? { x: r.x, width: r.width } : { y: r.y, height: r.height };
}

// Per-axis cascading-push resolution for a RESIZE. `handle` matters here,
// not just the two boxes: a corner handle changes width AND height from
// ONE mouse position, but the two are independent degrees of freedom — a
// neighbor that only blocks the growing HEIGHT must not also freeze
// WIDTH, which has nothing to do with it. Each axis the handle actually
// touches (skipped entirely when `handle.fx`/`fy` is 0.5 — that axis
// doesn't move for this handle) advances its growing edge from `startBox`
// (the gesture's fixed, guaranteed-valid starting box) towards
// `candidateBox` (this frame's fully snapped/boundary-clamped target),
// X first using the start height as the reference row, then Y using the
// just-resolved width as the reference column — the same order
// resolveMoveCollision uses. The opposite (non-growing) edge never moves,
// so it never needs to push anything. Only meaningful for an UNROTATED
// item — see hardStopResizeAxis for the rotated fallback.
export function resolveResizeCollision(startBox, candidateBox, handle, neighbors, bounds, margin = COLLISION_MARGIN) {
  const rotation = candidateBox.rotation || 0;
  if (!neighbors.length) return { x: candidateBox.x, y: candidateBox.y, width: candidateBox.width, height: candidateBox.height, rotation, pushed: new Map() };
  const gap = margin * 2;
  let x = candidateBox.x;
  let y = candidateBox.y;
  let width = candidateBox.width;
  let height = candidateBox.height;
  const pushedX = new Map();
  const pushedY = new Map();

  if (handle.fx !== 0.5) {
    if (rotation === 0) {
      const dir = handle.fx === 1 ? 1 : -1;
      const fixedX = dir > 0 ? candidateBox.x : candidateBox.x + candidateBox.width;
      const rowMinY = startBox.y;
      const rowMaxY = startBox.y + startBox.height;
      const startEdge = dir > 0 ? startBox.x + startBox.width : startBox.x;
      const desiredEdge = dir > 0 ? candidateBox.x + candidateBox.width : candidateBox.x;
      const boundaryEdge = dir > 0 ? bounds.maxX : bounds.minX;
      const { edge, pushed } = cascadeEdge('x', dir, startEdge, desiredEdge, rowMinY, rowMaxY, neighbors, boundaryEdge, gap);
      if (dir > 0) {
        x = fixedX;
        width = Math.max(16, edge - fixedX);
      } else {
        x = edge;
        width = Math.max(16, fixedX - edge);
      }
      pushed.forEach((v, id) => pushedX.set(id, v));
    } else {
      const r = hardStopResizeAxis('x', startBox, { x, y, width, height, rotation }, neighbors, margin);
      x = r.x;
      width = r.width;
    }
  }

  if (handle.fy !== 0.5) {
    if (rotation === 0) {
      const dir = handle.fy === 1 ? 1 : -1;
      const fixedY = dir > 0 ? candidateBox.y : candidateBox.y + candidateBox.height;
      const shiftedNeighbors = neighbors.map((n) => (pushedX.has(n.id) ? { ...n, x: n.x + pushedX.get(n.id) } : n));
      const colMinX = x;
      const colMaxX = x + width;
      const startEdge = dir > 0 ? startBox.y + startBox.height : startBox.y;
      const desiredEdge = dir > 0 ? candidateBox.y + candidateBox.height : candidateBox.y;
      const boundaryEdge = dir > 0 ? bounds.maxY : bounds.minY;
      const { edge, pushed } = cascadeEdge('y', dir, startEdge, desiredEdge, colMinX, colMaxX, shiftedNeighbors, boundaryEdge, gap);
      if (dir > 0) {
        y = fixedY;
        height = Math.max(16, edge - fixedY);
      } else {
        y = edge;
        height = Math.max(16, fixedY - edge);
      }
      pushed.forEach((v, id) => pushedY.set(id, v));
    } else {
      const r = hardStopResizeAxis('y', startBox, { x, y, width, height, rotation }, neighbors, margin);
      y = r.y;
      height = r.height;
    }
  }

  const pushed = new Map();
  neighbors.forEach((n) => {
    const dx = pushedX.get(n.id) || 0;
    const dy = pushedY.get(n.id) || 0;
    if (dx || dy) pushed.set(n.id, { x: n.x + dx, y: n.y + dy });
  });
  return { x, y, width, height, rotation, pushed };
}

// Hard boundary constraint for a MOVE: clamp a box's position so it never
// leaves `bounds` (see getItemBounds — [0,page.width] for a shape,
// [PAGE_PADDING, page.width-PAGE_PADDING] for a content item, same on Y),
// while still allowing it to sit exactly flush against whichever boundary
// applies to this item. Also reports which edges the (clamped) box is now
// touching, so the caller can drive an edge-contact highlight. Width/height
// don't change here — a move only ever slides x/y.
export function clampToPage(box, bounds) {
  const width = Math.min(box.width, bounds.maxX - bounds.minX);
  const height = Math.min(box.height, bounds.maxY - bounds.minY);
  const x = Math.max(bounds.minX, Math.min(box.x, bounds.maxX - width));
  const y = Math.max(bounds.minY, Math.min(box.y, bounds.maxY - height));
  return {
    x,
    y,
    width,
    height,
    edges: {
      left: x <= bounds.minX + 0.5,
      right: x + width >= bounds.maxX - 0.5,
      top: y <= bounds.minY + 0.5,
      bottom: y + height >= bounds.maxY - 0.5,
    },
  };
}

// Hard boundary constraint for a RESIZE, against the same kind-aware
// `bounds`. Unlike a move, a resize has a FIXED edge (whichever one the
// dragged handle isn't on — see resizeRotatedBox) that must never shift;
// only the growing edge's extent gets capped at the boundary. Using the
// position-only clampToPage here would incorrectly slide the fixed edge
// inward instead, breaking the "opposite corner/edge stays put" contract
// of a resize gesture.
export function clampResizeToPage(box, handle, bounds, minSize = 16) {
  let { x, y, width, height } = box;

  if (handle.fx === 1) {
    if (x < bounds.minX) { width += x - bounds.minX; x = bounds.minX; }
    width = Math.max(minSize, Math.min(width, bounds.maxX - x));
  } else if (handle.fx === 0) {
    const right = x + width;
    x = Math.max(bounds.minX, x);
    width = Math.max(minSize, right - x);
  }

  if (handle.fy === 1) {
    if (y < bounds.minY) { height += y - bounds.minY; y = bounds.minY; }
    height = Math.max(minSize, Math.min(height, bounds.maxY - y));
  } else if (handle.fy === 0) {
    const bottom = y + height;
    y = Math.max(bounds.minY, y);
    height = Math.max(minSize, bottom - y);
  }

  return {
    x,
    y,
    width,
    height,
    edges: {
      left: x <= bounds.minX + 0.5,
      right: x + width >= bounds.maxX - 0.5,
      top: y <= bounds.minY + 0.5,
      bottom: y + height >= bounds.maxY - 0.5,
    },
  };
}
