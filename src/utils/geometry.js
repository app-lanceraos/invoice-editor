// Rotate a vector (dx,dy) by `degrees` around the origin.
function rotateVector(dx, dy, degrees) {
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

// Hard boundary constraint for a MOVE: clamp a box's position so it never
// leaves [0,page.width]x[0,page.height], while still allowing it to sit
// exactly flush against an edge (needed for the existing edge-rail shape
// behavior). Also reports which edges the (clamped) box is now touching,
// so the caller can drive an edge-contact highlight. Width/height don't
// change here — a move only ever slides x/y.
export function clampToPage(box, page) {
  const width = Math.min(box.width, page.width);
  const height = Math.min(box.height, page.height);
  const x = Math.max(0, Math.min(box.x, page.width - width));
  const y = Math.max(0, Math.min(box.y, page.height - height));
  return {
    x,
    y,
    width,
    height,
    edges: {
      left: x <= 0.5,
      right: x + width >= page.width - 0.5,
      top: y <= 0.5,
      bottom: y + height >= page.height - 0.5,
    },
  };
}

// Hard boundary constraint for a RESIZE. Unlike a move, a resize has a
// FIXED edge (whichever one the dragged handle isn't on — see
// resizeRotatedBox) that must never shift; only the growing edge's extent
// gets capped at the page boundary. Using the position-only clampToPage
// here would incorrectly slide the fixed edge inward instead, breaking
// the "opposite corner/edge stays put" contract of a resize gesture.
export function clampResizeToPage(box, handle, page, minSize = 16) {
  let { x, y, width, height } = box;

  if (handle.fx === 1) {
    if (x < 0) { width += x; x = 0; }
    width = Math.max(minSize, Math.min(width, page.width - x));
  } else if (handle.fx === 0) {
    const right = x + width;
    x = Math.max(0, x);
    width = Math.max(minSize, right - x);
  }

  if (handle.fy === 1) {
    if (y < 0) { height += y; y = 0; }
    height = Math.max(minSize, Math.min(height, page.height - y));
  } else if (handle.fy === 0) {
    const bottom = y + height;
    y = Math.max(0, y);
    height = Math.max(minSize, bottom - y);
  }

  return {
    x,
    y,
    width,
    height,
    edges: {
      left: x <= 0.5,
      right: x + width >= page.width - 0.5,
      top: y <= 0.5,
      bottom: y + height >= page.height - 0.5,
    },
  };
}
