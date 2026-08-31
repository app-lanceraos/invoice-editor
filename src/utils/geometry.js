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

// Every point on `otherPoints` within `tolerance` of any of the box's own
// left/center/right (or top/center/bottom, whichever axis `pos`/`size`
// represent) — i.e. every alignment that's actually engaged right now, not
// just the single closest one snapAxis uses for the position delta. Several
// other items can legitimately share the same aligned line (three items all
// left-aligned at the same x, say), so this dedupes to the line positions
// themselves rather than one entry per contributing item.
function findAlignments(pos, size, otherPoints, tolerance = GUIDE_TOLERANCE) {
  const points = [pos, pos + size / 2, pos + size];
  const matches = new Set();
  points.forEach((p) => {
    otherPoints.forEach((op) => {
      if (Math.abs(op - p) <= tolerance) matches.add(op);
    });
  });
  return Array.from(matches);
}

// Smart guides for a box mid-drag/resize against every OTHER item (shapes
// included — aligning text to a decorative rail's edge is a real case).
// Two independent things, both purely visual/informational:
//   - `vertical`/`horizontal`: page-spanning line positions to render,
//     wherever this box's own edges/center are actually within tolerance
//     of another item's — separate from the page-boundary edge highlight,
//     which is its own system (see clampToPage/clampResizeToPage).
//   - `labels`: live pixel-gap readouts to the nearest non-overlapping
//     neighbor on each side, shown independent of whether a snap is
//     engaged — "nearest in the same row/column, and close enough to be
//     worth mentioning" per DISTANCE_LABEL_RANGE.
export function computeGuides(box, others) {
  const otherXPoints = others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width]);
  const otherYPoints = others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height]);
  const vertical = findAlignments(box.x, box.width, otherXPoints);
  const horizontal = findAlignments(box.y, box.height, otherYPoints);

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

  const labels = [];
  if (leftGap !== null) labels.push({ x: box.x - leftGap / 2, y: box.y + box.height / 2, text: `${Math.round(leftGap)}px` });
  if (rightGap !== null) labels.push({ x: box.x + box.width + rightGap / 2, y: box.y + box.height / 2, text: `${Math.round(rightGap)}px` });
  if (topGap !== null) labels.push({ x: box.x + box.width / 2, y: box.y - topGap / 2, text: `${Math.round(topGap)}px` });
  if (bottomGap !== null) labels.push({ x: box.x + box.width / 2, y: box.y + box.height + bottomGap / 2, text: `${Math.round(bottomGap)}px` });

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

function boxesOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

// Hard, per-axis contact resolution for a MOVE, in the standard AABB
// "slide along the wall" style: X is resolved first (using the last valid
// Y as the reference row), then Y is resolved using the just-resolved X as
// the reference column — so a diagonal drag into a neighbor's edge stops
// the blocked axis at contact while the other axis keeps tracking the
// mouse. `lastValid` must be a position this same item was already
// legally at (no overlap) — the gesture's gradually-updated last-good
// frame, not the drag's original start, so movement stays continuous.
export function resolveMoveCollision(lastValid, desired, size, rotation, neighborBoxes, margin = COLLISION_MARGIN) {
  if (!neighborBoxes.length) return { x: desired.x, y: desired.y };
  // Local (pre-translation) bbox offsets — rotation/size don't change
  // during a move, so this is the same shape at every (x, y), just shifted.
  const local = rotatedBoundingBox({ x: 0, y: 0, width: size.width, height: size.height, rotation });

  let x = desired.x;
  const rowMinY = lastValid.y + local.minY - margin;
  const rowMaxY = lastValid.y + local.maxY + margin;
  if (desired.x > lastValid.x) {
    let limit = Infinity;
    neighborBoxes.forEach((n) => {
      // Only a neighbor actually ahead of us (its blocking edge is not
      // behind where we already validly are) can cap this move — one that
      // merely happens to share a row/column but sits behind or off to the
      // side must never drag the limit back past lastValid.
      const bound = n.minX - local.maxX - margin;
      if (rowMinY < n.maxY && rowMaxY > n.minY && bound >= lastValid.x) limit = Math.min(limit, bound);
    });
    x = Math.max(lastValid.x, Math.min(desired.x, limit));
  } else if (desired.x < lastValid.x) {
    let limit = -Infinity;
    neighborBoxes.forEach((n) => {
      const bound = n.maxX - local.minX + margin;
      if (rowMinY < n.maxY && rowMaxY > n.minY && bound <= lastValid.x) limit = Math.max(limit, bound);
    });
    x = Math.min(lastValid.x, Math.max(desired.x, limit));
  }

  let y = desired.y;
  const colMinX = x + local.minX - margin;
  const colMaxX = x + local.maxX + margin;
  if (desired.y > lastValid.y) {
    let limit = Infinity;
    neighborBoxes.forEach((n) => {
      const bound = n.minY - local.maxY - margin;
      if (colMinX < n.maxX && colMaxX > n.minX && bound >= lastValid.y) limit = Math.min(limit, bound);
    });
    y = Math.max(lastValid.y, Math.min(desired.y, limit));
  } else if (desired.y < lastValid.y) {
    let limit = -Infinity;
    neighborBoxes.forEach((n) => {
      const bound = n.maxY - local.minY + margin;
      if (colMinX < n.maxX && colMaxX > n.minX && bound <= lastValid.y) limit = Math.max(limit, bound);
    });
    y = Math.min(lastValid.y, Math.max(desired.y, limit));
  }

  return { x, y };
}

// Hard-stop resolution for a RESIZE. `handle` matters here, not just the
// two boxes: a corner handle changes width AND height from ONE mouse
// position, but the two are independent degrees of freedom — a neighbor
// that only blocks the growing HEIGHT must not also freeze WIDTH, which
// has nothing to do with it. So each axis the handle actually touches
// (skipped entirely when `handle.fx`/`fy` is 0.5 — that axis doesn't move
// for this handle) is bisected separately along the straight line from
// `startBox` (the gesture's fixed, guaranteed-valid starting box — same
// "never mutated mid-gesture" value clampResizeToPage already uses) to
// `candidateBox` (this frame's fully snapped/boundary-clamped target),
// X first using the start height as the reference row, then Y using the
// just-resolved width as the reference column — the same sequential
// pattern resolveMoveCollision uses, adapted to resize's "one edge grows,
// the opposite edge stays fixed" shape instead of free translation.
export function resolveResizeCollision(startBox, candidateBox, handle, neighborBoxes, margin = COLLISION_MARGIN) {
  if (!neighborBoxes.length) return candidateBox;
  const collides = (box) => {
    const bbox = rotatedBoundingBox(box);
    const expanded = { minX: bbox.minX - margin, maxX: bbox.maxX + margin, minY: bbox.minY - margin, maxY: bbox.maxY + margin };
    return neighborBoxes.some((n) => boxesOverlap(expanded, n));
  };

  let x = candidateBox.x;
  let width = candidateBox.width;
  if (handle.fx !== 0.5) {
    const testX = (t) => ({
      x: startBox.x + (candidateBox.x - startBox.x) * t,
      y: startBox.y,
      width: startBox.width + (candidateBox.width - startBox.width) * t,
      height: startBox.height,
      rotation: candidateBox.rotation,
    });
    if (collides(testX(0))) {
      // Defensive: this axis was already invalid before the gesture even
      // moved it (shouldn't normally happen) — stay exactly where it was
      // rather than let an unclamped candidate slip through.
      x = startBox.x;
      width = startBox.width;
    } else if (collides(testX(1))) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i++) {
        const t = (lo + hi) / 2;
        if (collides(testX(t))) hi = t;
        else lo = t;
      }
      const r = testX(lo);
      x = r.x;
      width = r.width;
    }
  }

  let y = candidateBox.y;
  let height = candidateBox.height;
  if (handle.fy !== 0.5) {
    const testY = (t) => ({
      x,
      y: startBox.y + (candidateBox.y - startBox.y) * t,
      width,
      height: startBox.height + (candidateBox.height - startBox.height) * t,
      rotation: candidateBox.rotation,
    });
    if (collides(testY(0))) {
      y = startBox.y;
      height = startBox.height;
    } else if (collides(testY(1))) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i++) {
        const t = (lo + hi) / 2;
        if (collides(testY(t))) hi = t;
        else lo = t;
      }
      const r = testY(lo);
      y = r.y;
      height = r.height;
    }
  }

  return { x, y, width, height, rotation: candidateBox.rotation };
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
