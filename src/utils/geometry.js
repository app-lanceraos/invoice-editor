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
