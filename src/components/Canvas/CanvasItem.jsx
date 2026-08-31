import React, { useRef, useState } from 'react';
import { ELEMENT_TYPES } from '../../data/elementCatalog';
import { useEditor } from '../../state/EditorContext';
import { WordmarkSVG } from '../Brand';
import { fontFamilyCSS } from '../../data/fonts';
import {
  RESIZE_HANDLES,
  resizeRotatedBox,
  snapRotation,
  snapAxis,
  clampToPage,
  clampResizeToPage,
  getItemBounds,
  getFooterTop,
  computeGuides,
  rotateVector,
  collisionBoxes,
  resolveMoveCollision,
  resolveResizeCollision,
} from '../../utils/geometry';

// Table columns default to equal shares of the table's width; stored as
// percentages (summing to 100) rather than px, so they stay meaningful
// regardless of how the table itself gets resized/scaled as a whole.
function defaultColumnWidths(count) {
  return Array(count).fill(100 / count);
}

const MIN_COLUMN_PCT = 6;
const NOOP = () => {};
// How far outside the item's own border each resize handle floats —
// standard design-tool convention (a corner/edge dot hovering just clear
// of the selection outline, not sitting on top of it).
const HANDLE_GAP = 8;
function handleOffset(fx) {
  return (fx - 0.5) * 2 * HANDLE_GAP;
}

// Text-bearing variants whose box no longer scales its content (Prompt
// 13): resizing WIDTH changes the wrapping width text reflows within,
// resizing HEIGHT changes how much vertical room it has to sit in — font
// size is controlled only by the explicit size field (PropertiesPanel's
// FontControls), never derived from the box. `image`/`divider`/`qr`/
// `table`/`footer` keep the original Prompt 3/11 content-scaling-with-box
// behavior (an intrinsic asset size, a fixed grid, hand-managed column
// widths, or — for `table` — a deliberate exception even though its own
// cells are text, per Prompt 13's brief) — those still stretch via
// `.item__scale`'s transform, unaffected by anything below.
const TEXT_VARIANTS = new Set(['text', 'label-value', 'block', 'note']);

// left/center/right → text-align/justify-content (Prompt 11); top/middle/
// bottom → the outer `.item__scale` flex wrapper's justify-content
// (Prompt 13) — this is what actually POSITIONS the (now fixed-size) text
// within extra box height instead of stretching it to fill that height.
function vAlignToFlex(v) {
  return v === 'middle' ? 'center' : v === 'bottom' ? 'flex-end' : 'flex-start';
}

function partInlineStyle(item, part, fallbackColor, fallbackWeight, fallbackSize) {
  const s = (item && item[part]) || {};
  return {
    color: s.textColor || fallbackColor,
    background: s.bgColor,
    borderColor: s.borderColor,
    borderWidth: s.borderWidth ? `${s.borderWidth}px` : undefined,
    borderStyle: s.borderWidth ? 'solid' : undefined,
    fontFamily: fontFamilyCSS(s.fontFamily),
    fontWeight: s.fontWeight || fallbackWeight,
    fontSize: s.fontSize || fallbackSize,
    // Left unset (rather than defaulted) when the part has no override —
    // the container it sits in (`.item__block`) carries the whole-item
    // default via ordinary CSS inheritance, so a part only needs its own
    // value when it's deliberately different from that default.
    textAlign: s.contentAlign || undefined,
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
  const fontStyle = (fallbackWeight, fallbackSize) => ({
    fontFamily: fontFamilyCSS(item.fontFamily),
    fontWeight: item.fontWeight || fallbackWeight,
    fontSize: item.fontSize || fallbackSize,
  });
  // How content sits inside its own box — independent of the align-to-page
  // buttons (those move the box itself; this only affects the content
  // painted inside it). Not offered for every variant: a `spread`
  // label-value (Subtotal etc.) already spreads label/value via
  // `justify-content: space-between`, and `table` cells have their own
  // per-column left/right rule — a generic align control would just fight
  // both. Vertical position (top/middle/bottom) is a separate, outer
  // concern — see the `.item__scale` flex wrapper in CanvasItem below —
  // this only ever governs horizontal placement.
  const alignStyle = () => ({ textAlign: item.contentAlign || 'left' });

  switch (def.variant) {
    case 'text':
      return <div className="item__text" style={{ height: 'auto', ...fontStyle(undefined, 10), ...alignStyle() }}>{data}</div>;
    case 'label-value': {
      const fallbackWeight = def.strong ? 700 : undefined;
      const fallbackSize = def.strong ? 11 : 10;
      const labelStyle = partInlineStyle(item, 'label', undefined, fallbackWeight, fallbackSize);
      const valueStyle = partInlineStyle(item, 'value', undefined, fallbackWeight, fallbackSize);
      // `spread` (Subtotal/Tax/Discount/Total due) always spreads label
      // left / value right across the row's full width — the whole-item
      // align control doesn't apply to these (see ALIGNABLE_VARIANTS in
      // PropertiesPanel.jsx), so `item.contentAlign` is only meaningful
      // for a tight, non-spread pair like Due Date/Issue Date.
      const justify = def.spread
        ? 'space-between'
        : item.contentAlign === 'center' ? 'center' : item.contentAlign === 'right' ? 'flex-end' : 'flex-start';
      return (
        <div
          className="item__label-value"
          style={{
            height: 'auto',
            justifyContent: justify,
            borderTop: def.strong ? '1px solid #262420' : undefined,
            paddingTop: def.strong ? 4 : undefined,
          }}
        >
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
      // The whole item's chosen alignment is the container's own
      // `text-align` — every line inherits it unless that specific part
      // has its own override (partInlineStyle only sets `textAlign` when
      // the part actually has one, so inheritance passes through cleanly).
      // `height: 'auto'` (inline, not the shared `.item__block` CSS
      // default of 100%) — this class is also reused by `qr`'s title+body
      // layout below, which still needs height:100% for its `flex: 1`
      // QR-code area to fill the (still content-scaled) box; only this
      // case's own instance opts out of that.
      const titleStyle = partInlineStyle(item, 'title', '#a2896b', undefined, 8);
      const hidden = item.hiddenLines || [];
      const visibleLines = data.lines.filter((line) => !hidden.includes(line.key));
      return (
        <div className="item__block" style={{ height: 'auto', ...alignStyle() }}>
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
              style={partInlineStyle(item, line.key, '#55524a', undefined, 9)}
              key={line.key}
              onClick={(e) => onSelectPart(e, line.key)}
            >
              {line.text}
            </div>
          ))}
        </div>
      );
    }
    case 'note':
      return <div className="item__text" style={{ height: 'auto', opacity: 0.6, ...fontStyle(undefined, 10), ...alignStyle() }}>{data}</div>;
    case 'image':
      // No border/background of its own — the outer frame (CanvasItem)
      // already renders the item's border/background, and this placeholder
      // is that same box's content, not a second nested one. Real assets
      // (public/favicon.svg, public/signature.png) — not illustrative
      // currentColor art — so the frame's Text color control is hidden for
      // these two types in the properties panel (PropertiesPanel.jsx);
      // `object-fit: contain` keeps each asset's own aspect ratio intact
      // through a non-uniform resize instead of stretching it.
      if (item.type === 'logo') {
        return <img src="/favicon.svg" alt="Logo" className="item__image-placeholder" style={{ objectFit: 'contain' }} />;
      }
      if (item.type === 'signatureImage') {
        return <img src="/signature.png" alt="Signature" className="item__image-placeholder" style={{ objectFit: 'contain' }} />;
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
      const titleStyle = partInlineStyle(item, 'title', '#a2896b', undefined, 8);
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
            ...fontStyle(undefined, 7),
          }}
        >
          <div className="item__footer-left">
            <div>{data.businessName}</div>
            <div>{data.email}</div>
          </div>
          {/* The wordmark is a fixed logotype (an SVG mark, not text) — its
              fill picks up the footer's own textColor through the same
              `--wordmark` custom property Brand.jsx already reads, same
              currentColor-recoloring mechanism the Logo/Signature
              placeholder art used before those became real assets. Font
              family/weight stay inapplicable here: fontStyle() cascading
              onto this element has no effect on an SVG's own paths. */}
          <div className="item__footer-right" style={{ '--wordmark': item.textColor || '#a09a89' }}>
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
      // Independent of column WIDTH (item.columnWidths, dragged via the
      // divider handles) — alignment is purely a text-align choice within
      // whatever width a column already has, so the two never fight.
      // Defaults match the standing convention (first column left, the
      // rest right, e.g. numbers/currency) until a column's own choice
      // overrides it.
      const columnAlign = (j) => item.columnAlign?.[j] || (j === 0 ? 'left' : 'right');
      const cellPadding = item.cellPadding ?? 4;
      return (
        <table className="item__table">
          <thead>
            <tr>
              {data.columns.map((c, j) => (
                <th
                  key={c}
                  style={{
                    width: `${widths[j]}%`,
                    textAlign: columnAlign(j),
                    padding: cellPadding,
                    fontFamily: fontFamilyCSS(item.fontFamily),
                    fontWeight: item.headerFontWeight || item.fontWeight || 700,
                    fontSize: item.headerFontSize || 7,
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
                      textAlign: columnAlign(j),
                      padding: cellPadding,
                      ...fontStyle(undefined, 8.5),
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
// `readOnly` (set by PreviewModal, via EditorCanvas/CanvasLayer) is what
// keeps Preview a clean read-only render of the SAME shared EditorContext
// rather than a separate tree: with it true, this item ignores whatever
// `selection` currently holds (an item selected in the live editor behind
// the modal must not show its outline/handles here) and never wires up the
// move/resize/rotate/part-click handlers that would mutate the live
// template out from under the editor.
export default function CanvasItem({ item, readOnly = false }) {
  const { template, selection, setSelection, updateItem, setEdgeHighlight, setGuides } = useEditor();
  const def = item.kind === 'content' ? ELEMENT_TYPES[item.type] : null;

  const isSelected = !readOnly && selection.ids.includes(item.id);
  const isPartSelected = (part) =>
    !readOnly && !!selection.part && selection.part.id === item.id && selection.part.key === part;
  const isWholeSelected = isSelected && !(selection.part && selection.part.id === item.id);

  const [live, setLive] = useState(null); // { x, y, width, height, rotation } while dragging
  const [rotationSnapped, setRotationSnapped] = useState(false);
  const draggedRef = useRef(false); // did the current mousedown gesture actually move?

  const current = { ...item, ...(live || {}) };
  const rotation = current.rotation || 0;

  // Text variants (Prompt 13) don't scale their content to the box at
  // all: scale is pinned to 1, and the `.item__scale` wrapper is sized to
  // the box directly (current.width/height) rather than a natural size —
  // width becomes the text's wrapping width, height becomes the space its
  // vertical alignment positions it within. Every other variant keeps the
  // original Prompt 3/11 behavior unchanged: content renders at its fixed
  // natural size and a transform stretches it to fill the box.
  const isTextVariant = !!def && TEXT_VARIANTS.has(def.variant);
  const scaleX = isTextVariant || !(item.naturalWidth > 0) ? 1 : current.width / item.naturalWidth;
  const scaleY = isTextVariant || !(item.naturalHeight > 0) ? 1 : current.height / item.naturalHeight;
  const scaleWrapperWidth = isTextVariant ? current.width : item.naturalWidth;
  const scaleWrapperHeight = isTextVariant ? current.height : item.naturalHeight;

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
    const bounds = getItemBounds(item, template.page, getFooterTop(template.items, template.page));
    // This item's own boundary (true page edge for a shape, PAGE_PADDING
    // inset for content) joins every other item's edges as snap candidates
    // — same ~4px tolerance, so a drag lands flush against it just as
    // readily as against a neighboring item (still required for rails).
    const otherXEdges = [...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width]), bounds.minX, bounds.maxX];
    const otherYEdges = [...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height]), bounds.minY, bounds.maxY];
    // Collision is content-vs-content only — shapes stay exempt, same rail
    // exception as the Prompt 5 edge-padding rule. Neighbor boxes are
    // static for the duration of this gesture (only one item ever moves at
    // a time), so they're computed once here rather than every frame.
    const collisionNeighbors =
      item.kind === 'content' ? collisionBoxes(others.filter((o) => o.kind === 'content')) : null;
    let lastValid = { x: item.x, y: item.y };
    let finalPos = null;

    const onMove = (ev) => {
      draggedRef.current = true;
      let nx = start.origX + (ev.clientX - start.x);
      let ny = start.origY + (ev.clientY - start.y);
      // (1) guide/edge snap, (2) page/footer boundary clamp, (3) collision
      // clamp last — collision is the hardest constraint, so it must win
      // if it disagrees with a snap; the guide line drawn below reflects
      // the FINAL (post-collision) position, never a snap that collision
      // ended up overriding.
      nx += snapAxis(nx, item.width, otherXEdges);
      ny += snapAxis(ny, item.height, otherYEdges);
      const clamped = clampToPage({ x: nx, y: ny, width: item.width, height: item.height }, bounds);
      let fx = clamped.x;
      let fy = clamped.y;
      if (collisionNeighbors) {
        const resolved = resolveMoveCollision(
          lastValid,
          { x: fx, y: fy },
          { width: item.width, height: item.height },
          item.rotation || 0,
          collisionNeighbors
        );
        fx = resolved.x;
        fy = resolved.y;
        lastValid = { x: fx, y: fy };
      }
      finalPos = { x: fx, y: fy };
      setEdgeHighlight(clamped.edges);
      setGuides(computeGuides({ x: fx, y: fy, width: item.width, height: item.height }, others));
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
    const bounds = getItemBounds(item, template.page, getFooterTop(template.items, template.page));
    const others = template.items.filter((i) => i.id !== item.id);
    // Same candidate set a move drag snaps against: every other item's
    // left/center/right (or top/center/bottom), plus this item's own page
    // boundary — a resized edge should land flush against a neighbor just
    // as readily as against the page edge.
    const snapXCandidates = [...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width]), bounds.minX, bounds.maxX];
    const snapYCandidates = [...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height]), bounds.minY, bounds.maxY];
    const collisionNeighbors =
      item.kind === 'content' ? collisionBoxes(others.filter((o) => o.kind === 'content')) : null;
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
      let box = { x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height, rotation: start.rotation };
      if (collisionNeighbors) {
        box = resolveResizeCollision(start, box, handle, collisionNeighbors);
      }
      finalBox = { x: box.x, y: box.y, width: box.width, height: box.height };
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
        cursor: readOnly ? 'default' : item.locked ? 'default' : 'grab',
        ...frameStyle,
      }}
      onMouseDown={readOnly ? undefined : beginMove}
    >
      <div
        className="item__scale"
        style={{
          width: scaleWrapperWidth,
          height: scaleWrapperHeight,
          transform: isTextVariant ? undefined : `scale(${scaleX}, ${scaleY})`,
          // A box smaller than its text's natural footprint should show
          // that (spill past the box, still fully visible) rather than
          // silently clip it away — same safety net as before, just no
          // longer paired with a scale transform for text variants.
          overflow: isTextVariant ? 'visible' : undefined,
          // Text variants position their (fixed-size) content within any
          // extra box height via this flex wrapper instead of stretching
          // it — top/middle/bottom, Prompt 13's new vertical align control.
          display: isTextVariant ? 'flex' : undefined,
          flexDirection: isTextVariant ? 'column' : undefined,
          justifyContent: isTextVariant ? vAlignToFlex(item.contentAlignY) : undefined,
        }}
      >
        {item.kind === 'shape' ? (
          <ShapeBody item={item} />
        ) : (
          <ContentBody item={current} isPartSelected={isPartSelected} onSelectPart={readOnly ? NOOP : handlePartClick} />
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
              style={{
                left: `calc(${h.fx * 100}% + ${handleOffset(h.fx)}px)`,
                top: `calc(${h.fy * 100}% + ${handleOffset(h.fy)}px)`,
                cursor: h.cursor,
              }}
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
