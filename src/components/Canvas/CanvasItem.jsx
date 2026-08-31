import React, { useRef, useState } from 'react';
import { ELEMENT_TYPES } from '../../data/elementCatalog';
import { useEditor } from '../../state/EditorContext';
import { WordmarkSVG } from '../Brand';
import { fontFamilyCSS } from '../../data/fonts';
import { RESIZE_HANDLES, resizeRotatedBox, snapRotation, snapAxis, clampToPage, clampResizeToPage, getItemBounds, computeGuides, rotateVector } from '../../utils/geometry';

// Table columns default to equal shares of the table's width; stored as
// percentages (summing to 100) rather than px, so they stay meaningful
// regardless of how the table itself gets resized/scaled as a whole.
function defaultColumnWidths(count) {
  return Array(count).fill(100 / count);
}

const MIN_COLUMN_PCT = 6;

function partInlineStyle(item, part, fallbackColor, fallbackWeight) {
  const s = (item && item[part]) || {};
  return {
    color: s.textColor || fallbackColor,
    background: s.bgColor,
    borderColor: s.borderColor,
    borderWidth: s.borderWidth ? `${s.borderWidth}px` : undefined,
    borderStyle: s.borderWidth ? 'solid' : undefined,
    fontFamily: fontFamilyCSS(s.fontFamily),
    fontWeight: s.fontWeight || fallbackWeight,
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

  // Applied directly on the leaf text-bearing element (not inherited down
  // from the outer frame) so a variant with its own baked-in default weight
  // (row-strong's bold, a table header's bold) can supply that default
  // itself and still have the user's explicit choice win outright — an
  // inline style set here always beats both inheritance and any CSS rule,
  // default browser styling included.
  const fontStyle = (fallbackWeight) => ({
    fontFamily: fontFamilyCSS(item.fontFamily),
    fontWeight: item.fontWeight || fallbackWeight,
  });

  switch (def.variant) {
    case 'text':
      return <div className="item__text" style={fontStyle()}>{data}</div>;
    case 'label-value': {
      const labelStyle = partInlineStyle(item, 'label', undefined);
      const valueStyle = partInlineStyle(item, 'value', undefined);
      return (
        <div className="item__label-value">
          <span
            className={`item__label${isPartSelected('label') ? ' item__label--selected' : ''}`}
            style={labelStyle}
            onClick={(e) => onSelectPart(e, 'label')}
          >
            {data.label}
          </span>
          <span
            className={`item__value${isPartSelected('value') ? ' item__value--selected' : ''}`}
            style={valueStyle}
            onClick={(e) => onSelectPart(e, 'value')}
          >
            {data.value}
          </span>
        </div>
      );
    }
    case 'block': {
      const titleStyle = partInlineStyle(item, 'title', '#a2896b');
      const hidden = item.hiddenLines || [];
      const visibleLines = data.lines.filter((line) => !hidden.includes(line.key));
      return (
        <div className="item__block">
          <div
            className={`item__block-title${isPartSelected('title') ? ' item__block-title--selected' : ''}`}
            style={titleStyle}
            onClick={(e) => onSelectPart(e, 'title')}
          >
            {data.title.text}
          </div>
          {visibleLines.map((line) => (
            <div
              className={`item__block-line${isPartSelected(line.key) ? ' item__block-line--selected' : ''}`}
              style={partInlineStyle(item, line.key, '#55524a')}
              key={line.key}
              onClick={(e) => onSelectPart(e, line.key)}
            >
              {line.text}
            </div>
          ))}
        </div>
      );
    }
    case 'row':
      return (
        <div className="item__row" style={fontStyle()}>
          <span>{data[0]}</span><span>{data[1]}</span>
        </div>
      );
    case 'row-strong':
      return (
        <div className="item__row item__row--strong" style={fontStyle(700)}>
          <span>{data[0]}</span><span>{data[1]}</span>
        </div>
      );
    case 'note':
      return <div className="item__text" style={{ opacity: 0.6, ...fontStyle() }}>{data}</div>;
    case 'image':
      // No border/background of its own — the outer frame (CanvasItem)
      // already renders the item's border/background, and this placeholder
      // is that same box's content, not a second nested one. The SVG art
      // below uses currentColor for its "ink", so it inherits the frame's
      // own `color` (item.textColor) exactly the way the old plain-text
      // placeholder did — the Text color control keeps working, it's just
      // recoloring an illustrative mark instead of a word now.
      if (item.type === 'logo') {
        return (
          <svg viewBox="0 0 100 100" className="item__image-placeholder" preserveAspectRatio="xMidYMid meet">
            <circle cx="50" cy="50" r="46" fill="currentColor" fillOpacity="0.16" />
            <path d="M50 20 L76 68 L24 68 Z" fill="currentColor" fillOpacity="0.75" />
          </svg>
        );
      }
      if (item.type === 'signatureImage') {
        return (
          <svg viewBox="0 0 200 60" className="item__image-placeholder" preserveAspectRatio="xMidYMid meet">
            <path
              d="M10,40 C20,10 30,55 45,30 C55,12 60,45 75,35 C90,25 95,45 110,30 C120,18 130,40 145,28 C155,20 165,35 190,20"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.8"
            />
          </svg>
        );
      }
      // Any other 'image'-variant type (none currently defined) falls back
      // to the plain text-label placeholder.
      return <div className="item__image-placeholder">{data.placeholder}</div>;
    case 'divider':
      // A plain content-item version of the decorative line shape (color
      // + thickness) — thickness is just its own height, resized the same
      // way as every other item, so it needs no dedicated control.
      return <div className="item__divider" style={{ background: item.bgColor || '#262420', borderRadius: item.naturalHeight / 2 }} />;
    case 'qr': {
      const titleStyle = partInlineStyle(item, 'title', '#a2896b');
      // The QR pattern itself stays fixed black-on-white regardless of the
      // body's style overrides — a real QR needs strong, reliable contrast
      // to stay scannable, so only its surrounding box (background/border)
      // is user-styleable, not the code's own ink color.
      const bodyBoxStyle = partInlineStyle(item, 'body', undefined);
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
            className={`item__qr-wrap${isPartSelected('body') ? ' item__qr-wrap--selected' : ''}`}
            style={{
              background: bodyBoxStyle.background,
              borderColor: bodyBoxStyle.borderColor,
              borderWidth: bodyBoxStyle.borderWidth,
              borderStyle: bodyBoxStyle.borderStyle,
            }}
            onClick={(e) => onSelectPart(e, 'body')}
          >
            <svg viewBox={`0 0 ${data.qrSize} ${data.qrSize}`} className="item__qr-svg">
              <rect width={data.qrSize} height={data.qrSize} fill="#fff" />
              <path d={data.qrPath} fill="#000" />
            </svg>
          </div>
        </div>
      );
    }
    case 'footer':
      // color/borderTopColor set directly here (not just on the outer
      // frame) — .item__footer has its own hardcoded CSS color and
      // border-top, both of which are direct rules on this exact element
      // and would otherwise beat an inherited value from the frame,
      // same class of override needed for row-strong/table-th earlier.
      // fontStyle() cascades to footer-left/right via ordinary
      // inheritance — neither has its own font-family/weight rule to
      // fight with, unlike table's th.
      return (
        <div
          className="item__footer"
          style={{
            color: item.textColor || undefined,
            borderTopColor: item.dividerColor || undefined,
            ...fontStyle(),
          }}
        >
          <div className="item__footer-left">
            <div>{data.businessName}</div>
            <div>{data.email}</div>
          </div>
          <div className="item__footer-right">
            <span>Generated by</span>
            <WordmarkSVG width={56} height={8.4} />
          </div>
        </div>
      );
    case 'table': {
      // Font family/weight applied directly per th/td rather than on the
      // outer frame: a `<th>`'s own browser-default bold would otherwise
      // beat an inherited weight regardless of where that weight came
      // from, so th needs its own explicit (overridable) bold default.
      // Column widths (item.columnWidths, dragged via the column-divider
      // handles in CanvasItem) are independent of the outer 8-point
      // resize/scale — a redistribution of the SAME total width, not a
      // change to it.
      const widths = item.columnWidths || defaultColumnWidths(data.columns.length);
      return (
        <table className="item__table">
          <thead>
            <tr>
              {data.columns.map((c, j) => (
                <th
                  key={c}
                  style={{
                    width: `${widths[j]}%`,
                    fontFamily: fontFamilyCSS(item.fontFamily),
                    fontWeight: item.headerFontWeight || item.fontWeight || 700,
                    background: item.headerBg,
                    color: item.headerTextColor,
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i} style={item.altRowShading && i % 2 === 1 ? { background: item.altRowColor || '#f5f3ee' } : undefined}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    style={{
                      width: `${widths[j]}%`,
                      ...fontStyle(),
                      borderBottom:
                        item.rowBorderWidth !== undefined
                          ? `${item.rowBorderWidth}px solid ${item.rowBorderColor || '#e5e1d6'}`
                          : undefined,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
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
  const { template, selection, setSelection, updateItem, setEdgeHighlight, setGuides } = useEditor();
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
    if (item.locked) {
      // Still selectable (so its own style controls, e.g. the footer's,
      // are reachable) — just never moved, resized, or rotated. No
      // shift-toggle/multi-select for a locked item; a plain click just
      // selects it on its own.
      if (!selection.ids.includes(item.id)) setSelection({ ids: [item.id], part: null });
      return;
    }
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
    const bounds = getItemBounds(item, template.page);
    // This item's own boundary (true page edge for a shape, PAGE_PADDING
    // inset for content) joins every other item's edges as snap candidates
    // — same ~4px tolerance, so a drag lands flush against it just as
    // readily as against a neighboring item (still required for rails).
    const otherXEdges = [...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width]), bounds.minX, bounds.maxX];
    const otherYEdges = [...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height]), bounds.minY, bounds.maxY];
    let finalPos = null;

    const onMove = (ev) => {
      draggedRef.current = true;
      let nx = start.origX + (ev.clientX - start.x);
      let ny = start.origY + (ev.clientY - start.y);
      nx += snapAxis(nx, item.width, otherXEdges);
      ny += snapAxis(ny, item.height, otherYEdges);
      const clamped = clampToPage({ x: nx, y: ny, width: item.width, height: item.height }, bounds);
      finalPos = { x: clamped.x, y: clamped.y };
      setEdgeHighlight(clamped.edges);
      setGuides(computeGuides({ x: clamped.x, y: clamped.y, width: item.width, height: item.height }, others));
      setLive(finalPos);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalPos) updateItem(item.id, finalPos);
      setLive(null);
      setEdgeHighlight(null);
      setGuides(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const beginResize = (e, handle) => {
    e.stopPropagation();
    e.preventDefault();
    const start = { x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation || 0 };
    const startMouse = { x: e.clientX, y: e.clientY };
    const bounds = getItemBounds(item, template.page);
    const others = template.items.filter((i) => i.id !== item.id);
    // Same candidate set a move drag snaps against: every other item's
    // left/center/right (or top/center/bottom), plus this item's own page
    // boundary — a resized edge should land flush against a neighbor just
    // as readily as against the page edge.
    const snapXCandidates = [...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width]), bounds.minX, bounds.maxX];
    const snapYCandidates = [...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height]), bounds.minY, bounds.maxY];
    let finalBox = null;

    const onMove = (ev) => {
      draggedRef.current = true;
      const raw = resizeRotatedBox(start, handle, ev.clientX - startMouse.x, ev.clientY - startMouse.y);

      // Snap only the edge this handle actually moves, keeping the other
      // (fixed) edge untouched — e.g. dragging the W handle may shift x
      // left/right, but must adjust width oppositely so the right edge
      // stays exactly where the resize gesture already fixed it.
      if (handle.fx === 1) {
        const delta = snapAxis(raw.x + raw.width, 0, snapXCandidates);
        raw.width += delta;
      } else if (handle.fx === 0) {
        const delta = snapAxis(raw.x, 0, snapXCandidates);
        raw.x += delta;
        raw.width -= delta;
      }
      if (handle.fy === 1) {
        const delta = snapAxis(raw.y + raw.height, 0, snapYCandidates);
        raw.height += delta;
      } else if (handle.fy === 0) {
        const delta = snapAxis(raw.y, 0, snapYCandidates);
        raw.y += delta;
        raw.height -= delta;
      }

      const clamped = clampResizeToPage(raw, handle, bounds);
      finalBox = { x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height };
      setEdgeHighlight(clamped.edges);
      setGuides(computeGuides(finalBox, others));
      setLive(finalBox);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalBox) updateItem(item.id, finalBox);
      setLive(null);
      setEdgeHighlight(null);
      setGuides(null);
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

  // Drags one column-boundary divider — redistributes width between just
  // the two columns on either side of it, every other column and the
  // table's own total width/height (the outer 8-point resize) untouched.
  // Uses `live.columnWidths` (merged into `current` below) the same
  // one-undo-step-per-gesture way position/size do.
  const beginColumnResize = (e, colIndex) => {
    e.stopPropagation();
    e.preventDefault();
    const numCols = def.render().columns.length;
    const startWidths = item.columnWidths || defaultColumnWidths(numCols);
    const startMouse = { x: e.clientX, y: e.clientY };
    const rotation = item.rotation || 0;
    let finalWidths = null;

    const onMove = (ev) => {
      draggedRef.current = true;
      const local = rotateVector(ev.clientX - startMouse.x, ev.clientY - startMouse.y, -rotation);
      const deltaPct = (local.x / item.width) * 100;
      const widths = [...startWidths];
      let a = startWidths[colIndex] + deltaPct;
      let b = startWidths[colIndex + 1] - deltaPct;
      if (a < MIN_COLUMN_PCT) { b -= MIN_COLUMN_PCT - a; a = MIN_COLUMN_PCT; }
      if (b < MIN_COLUMN_PCT) { a -= MIN_COLUMN_PCT - b; b = MIN_COLUMN_PCT; }
      widths[colIndex] = a;
      widths[colIndex + 1] = b;
      finalWidths = widths;
      setLive({ columnWidths: widths });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalWidths) updateItem(item.id, { columnWidths: finalWidths });
      setLive(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // The selection outline (`.item--selected::after`) uses border-radius:
  // inherit, so the frame needs to carry the same radius as what's
  // actually rendered inside it — a plain 4px softening for content
  // (overridable per-item, exposed for the table's own dedicated corner-
  // radius control), the shape's own radius (including the ellipse/line
  // special cases) for shapes — otherwise a round shape would get a
  // square selection box.
  const frameStyle =
    item.kind === 'content'
      ? {
          borderRadius: item.cornerRadius ?? 4,
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
          <ContentBody item={current} isPartSelected={isPartSelected} onSelectPart={handlePartClick} />
        )}
      </div>

      {isWholeSelected && !item.locked && def?.variant === 'table' && (() => {
        const widths = current.columnWidths || defaultColumnWidths(def.render().columns.length);
        let cumulative = 0;
        return widths.slice(0, -1).map((w, i) => {
          cumulative += w;
          return (
            <div
              key={i}
              className="item__col-divider"
              style={{ left: `${cumulative}%` }}
              onMouseDown={(e) => beginColumnResize(e, i)}
            />
          );
        });
      })()}

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
