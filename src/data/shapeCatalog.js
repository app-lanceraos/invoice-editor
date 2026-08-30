// Fixed, professional shape primitives only. No freeform/polygon drawing.

export const SHAPE_TYPES = {
  roundedRect: {
    label: 'Rounded rectangle',
    defaultSize: { width: 160, height: 90 },
    defaultProps: { fill: '#7152F5', borderColor: 'transparent', borderWidth: 0, radius: 12 },
  },
  ellipse: {
    label: 'Circle / ellipse',
    defaultSize: { width: 120, height: 120 },
    defaultProps: { fill: '#A89CF2', borderColor: 'transparent', borderWidth: 0 },
  },
  line: {
    label: 'Line / divider',
    defaultSize: { width: 200, height: 4 },
    defaultProps: { fill: '#7152F5', borderColor: 'transparent', borderWidth: 0 },
  },
};

export const createShape = (type, position = { x: 40, y: 40 }) => {
  const def = SHAPE_TYPES[type];
  return {
    id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: 'shape',
    type,
    x: position.x,
    y: position.y,
    width: def.defaultSize.width,
    height: def.defaultSize.height,
    rotation: 0,
    ...def.defaultProps,
  };
};

// A shape counts as a candidate "rail" when it's flush against a page edge
// and spans that edge's full length (within a small tolerance).
export const RAIL_TOLERANCE_PX = 6;

export function detectRail(shape, pageSize) {
  const { x, y, width, height } = shape;
  const { width: pageW, height: pageH } = pageSize;

  if (x <= RAIL_TOLERANCE_PX && height >= pageH - RAIL_TOLERANCE_PX) return { edge: 'left', thickness: width };
  if (x + width >= pageW - RAIL_TOLERANCE_PX && height >= pageH - RAIL_TOLERANCE_PX)
    return { edge: 'right', thickness: width };
  if (y <= RAIL_TOLERANCE_PX && width >= pageW - RAIL_TOLERANCE_PX) return { edge: 'top', thickness: height };
  if (y + height >= pageH - RAIL_TOLERANCE_PX && width >= pageW - RAIL_TOLERANCE_PX)
    return { edge: 'bottom', thickness: height };
  return null;
}
