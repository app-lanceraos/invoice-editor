import React, { useRef, useState } from 'react';
import { ELEMENT_TYPES } from '../../data/elementCatalog';
import { useEditor } from '../../state/EditorContext';
import { RESIZE_HANDLES, resizeRotatedBox, snapRotation } from '../../utils/geometry';

function partInlineStyle(item, part, fallbackColor) {
  const s = (item && item[part]) || {};
  return {
    color: s.textColor || fallbackColor,
    background: s.bgColor,
    borderColor: s.borderColor,
    borderWidth: s.borderWidth ? `${s.borderWidth}px` : undefined,
    borderStyle: s.borderWidth ? 'solid' : undefined,
  };
}

// Renders a content item's baked-in display at its NATURAL size — the
// scale wrapper in CanvasItem stretches this to the item's current
// (possibly resized) box, so nothing here needs to know its current size.
// Only `block`/`qr` variants have an independently-selectable title/body;
// everything else is a single unstyled-by-part run of content.
function ContentBody({ item, isPartSelected, onSelectPart }) {
  const def = ELEMENT_TYPES[item.type];
  const data = def.render();

  switch (def.variant) {
    case 'text':
      return <div className="item__text">{data}</div>;
    case 'block': {
      const titleStyle = partInlineStyle(item, 'title', '#a2896b');
      const bodyStyle = partInlineStyle(item, 'body', '#55524a');
      return (
        <div className="item__block">
          <div
            className={`item__block-title${isPartSelected('title') ? ' item__block-title--selected' : ''}`}
            style={titleStyle}
            onClick={(e) => onSelectPart(e, 'title')}
          >
            {data[0]}
          </div>
          {data.slice(1).map((line, i) => (
            <div
              className={`item__block-line${isPartSelected('body') ? ' item__block-line--selected' : ''}`}
              style={bodyStyle}
              key={i}
              onClick={(e) => onSelectPart(e, 'body')}
            >
              {line}
            </div>
          ))}
        </div>
      );
    }
    case 'row':
      return (
        <div className="item__row">
          <span>{data[0]}</span><span>{data[1]}</span>
        </div>
      );
    case 'row-strong':
      return (
        <div className="item__row item__row--strong">
          <span>{data[0]}</span><span>{data[1]}</span>
        </div>
      );
    case 'note':
      return <div className="item__text" style={{ opacity: 0.6 }}>{data}</div>;
    case 'image':
      // No border/background of its own — the outer frame (CanvasItem)
      // already renders the item's border/background, and this placeholder
      // is that same box's content, not a second nested one. Text color
      // inherits from the frame's own `color`.
      return <div className="item__image-placeholder">{data.placeholder}</div>;
    case 'qr': {
      const titleStyle = partInlineStyle(item, 'title', '#a2896b');
      const bodyStyle = partInlineStyle(item, 'body', '#55524a');
      return (
        <div className="item__block">
          <div
            className={`item__block-title${isPartSelected('title') ? ' item__block-title--selected' : ''}`}
            style={titleStyle}
            onClick={(e) => onSelectPart(e, 'title')}
          >
            {data.label}
          </div>
          <div
            className={`item__block-line${isPartSelected('body') ? ' item__block-line--selected' : ''}`}
            style={bodyStyle}
            onClick={(e) => onSelectPart(e, 'body')}
          >
            {data.link}
          </div>
        </div>
      );
    }
    case 'table':
      return (
        <table className="item__table">
          <thead>
            <tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
    default:
      return null;
  }
}

function shapeBorderRadius(item) {
  if (item.type === 'ellipse') return '50%';
  if (item.type === 'line') return item.naturalHeight / 2;
  return item.radius;
}

// A shape's fill/border/radius IS its content — rendered at natural size
// and scaled by the same wrapper mechanism content items use, so a resize
// stretches the whole visual (border included) rather than just its frame.
function ShapeBody({ item }) {
  return (
    <div
      className="item__shape-fill"
      style={{
        background: item.fill,
        border: item.borderWidth ? `${item.borderWidth}px solid ${item.borderColor}` : 'none',
        borderRadius: shapeBorderRadius(item),
      }}
    />
  );
}

// Simple v1 edge-alignment snap (no existing snap-guide logic in the repo
// to extend): compare the dragged item's left/center/right (or
// top/center/bottom) against the same three reference points on every
// other item, and if the closest one is within `tolerance`, shift the
// dragged position by that small amount so the two align exactly.
function snapAxis(pos, size, otherEdges, tolerance = 4) {
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

const RotateIcon = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
    <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// IMPORTANT: move/resize/rotate must each produce exactly ONE undo step per
// gesture — local `live` preview state while the mouse is down, a single
// `updateItem` commit on mouseup. Shared by shapes and content items alike;
// only the rendered body (ShapeBody vs ContentBody) and a few style fields
// differ by `item.kind`.
export default function CanvasItem({ item }) {
  const { template, selection, setSelection, updateItem } = useEditor();
  const def = item.kind === 'content' ? ELEMENT_TYPES[item.type] : null;

  const isSelected = selection.ids.includes(item.id);
  const isPartSelected = (part) =>
    !!selection.part && selection.part.id === item.id && selection.part.key === part;
  const isWholeSelected = isSelected && !(selection.part && selection.part.id === item.id);

  const [live, setLive] = useState(null); // { x, y, width, height, rotation } while dragging
  const [rotationSnapped, setRotationSnapped] = useState(false);
  const draggedRef = useRef(false); // did the current mousedown gesture actually move?

  const current = { ...item, ...(live || {}) };
  const rotation = current.rotation || 0;
  const scaleX = current.width / item.naturalWidth;
  const scaleY = current.height / item.naturalHeight;

  const beginMove = (e) => {
    e.stopPropagation();
    if (item.locked) return;
    draggedRef.current = false;

    if (e.shiftKey) {
      const ids = selection.ids.includes(item.id)
        ? selection.ids.filter((id) => id !== item.id)
        : [...selection.ids, item.id];
      setSelection({ ids, part: null });
    } else if (!selection.ids.includes(item.id)) {
      setSelection({ ids: [item.id], part: null });
    }

    const start = { x: e.clientX, y: e.clientY, origX: item.x, origY: item.y };
    const others = template.items.filter((i) => i.id !== item.id);
    const otherXEdges = others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width]);
    const otherYEdges = others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height]);
    let finalPos = null;

    const onMove = (ev) => {
      draggedRef.current = true;
      let nx = start.origX + (ev.clientX - start.x);
      let ny = start.origY + (ev.clientY - start.y);
      nx += snapAxis(nx, item.width, otherXEdges);
      ny += snapAxis(ny, item.height, otherYEdges);
      finalPos = { x: nx, y: ny };
      setLive(finalPos);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalPos) updateItem(item.id, finalPos);
      setLive(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const beginResize = (e, handle) => {
    e.stopPropagation();
    e.preventDefault();
    const start = { x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation || 0 };
    const startMouse = { x: e.clientX, y: e.clientY };
    let finalBox = null;

    const onMove = (ev) => {
      draggedRef.current = true;
      finalBox = resizeRotatedBox(start, handle, ev.clientX - startMouse.x, ev.clientY - startMouse.y);
      setLive(finalBox);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalBox) updateItem(item.id, finalBox);
      setLive(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const beginRotate = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let finalRotation = null;

    const onMove = (ev) => {
      draggedRef.current = true;
      const raw = Math.round((Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90);
      const { value, snapped } = snapRotation(raw);
      finalRotation = { rotation: value };
      setRotationSnapped(snapped);
      setLive(finalRotation);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalRotation) updateItem(item.id, finalRotation);
      setLive(null);
      setRotationSnapped(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handlePartClick = (e, part) => {
    e.stopPropagation();
    if (draggedRef.current) return; // this click ended a drag, not a part pick
    setSelection({ ids: [item.id], part: { id: item.id, key: part } });
  };

  // The selection outline (`.item--selected::after`) uses border-radius:
  // inherit, so the frame needs to carry the same radius as what's
  // actually rendered inside it — a plain 4px softening for content, the
  // shape's own radius (including the ellipse/line special cases) for
  // shapes — otherwise a round shape would get a square selection box.
  const frameStyle =
    item.kind === 'content'
      ? {
          borderRadius: 4,
          borderColor: item.borderColor,
          borderWidth: item.borderWidth ? `${item.borderWidth}px` : undefined,
          borderStyle: item.borderWidth ? 'solid' : undefined,
          color: item.textColor,
          background: item.bgColor,
        }
      : { borderRadius: shapeBorderRadius(item) };

  return (
    <div
      className={`item item--${item.kind}${def ? ` item--${def.variant}` : ''}${isSelected ? ' item--selected' : ''}`}
      style={{
        position: 'absolute',
        left: current.x,
        top: current.y,
        width: current.width,
        height: current.height,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        cursor: item.locked ? 'default' : 'grab',
        ...frameStyle,
      }}
      onMouseDown={beginMove}
    >
      <div
        className="item__scale"
        style={{ width: item.naturalWidth, height: item.naturalHeight, transform: `scale(${scaleX}, ${scaleY})` }}
      >
        {item.kind === 'shape' ? (
          <ShapeBody item={item} />
        ) : (
          <ContentBody item={item} isPartSelected={isPartSelected} onSelectPart={handlePartClick} />
        )}
      </div>

      {isWholeSelected && !item.locked && (
        <>
          {RESIZE_HANDLES.map((h) => (
            <div
              key={h.key}
              className="item__resize-handle"
              style={{ left: `${h.fx * 100}%`, top: `${h.fy * 100}%`, cursor: h.cursor }}
              onMouseDown={(e) => beginResize(e, h)}
            />
          ))}
          <div
            className={`item__rotate-handle${rotationSnapped ? ' item__rotate-handle--snapped' : ''}`}
            onMouseDown={beginRotate}
          >
            {RotateIcon}
          </div>
        </>
      )}
    </div>
  );
}
