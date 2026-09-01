import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  edgeClearance,
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
// of the selection outline, not sitting on top of it). Adaptive (Prompt
// 14): a handle facing a neighbor too close for the full HANDLE_GAP
// shrinks just enough to stop short of it — down to flush with the
// item's own border, never negative/inside it — instead of visually
// oversitting onto the neighbor's own clickable area (the Prompt 13
// audit's finding, at the Prompt 12 minimum 2px gap). `HALF_HANDLE`
// accounts for the dot's own visual radius, so its EDGE clears the
// neighbor, not just the coordinate it's centered on.
const HANDLE_GAP = 8;
const HALF_HANDLE = 6;
function adaptiveHandleOffset(fx, negClearance, posClearance) {
  if (fx === 0.5) return 0;
  const clearance = fx === 1 ? posClearance : negClearance;
  const capped = clearance === Infinity ? HANDLE_GAP : Math.max(0, Math.min(HANDLE_GAP, clearance - HALF_HANDLE));
  return fx === 1 ? capped : -capped;
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

// Variants whose text can WRAP across multiple lines — their true minimum
// width is the widest single WORD (CSS `min-content`: anything narrower
// would overflow mid-word), not the full unwrapped text. `label-value`
// never wraps (`.item__label-value` is `white-space: nowrap`), so its
// minimum IS its full natural width — plain shrink-to-fit already gives
// that correctly.
const WRAPPING_VARIANTS = new Set(['text', 'note', 'block']);

// Prompt 14: a manually-set width/height is a MINIMUM for text, not a hard
// cap — Prompt 13 let a box smaller than its content spill text past its
// own frame as a safety net (better than silently hiding it), but left
// the frame's own size — and hence its collision footprint — stale,
// letting the overflow visually defeat Prompt 12's no-overlap guarantee.
// Two hidden, offscreen clones of the item's own content measure what the
// EFFECTIVE (possibly grown) box actually needs to be:
//   - `minRef`: width `min-content` for a wrapping variant, or
//     unconstrained/auto (shrink-to-fit — its true minimum, since it
//     never wraps) otherwise.
//   - `wrapRef`: width pinned to max(current box width, that measured
//     minimum) — the real height the text needs once wrapped at whatever
//     width it actually ends up rendering at.
// Neither value is ever written back to item.width/height — that would
// turn every font/resize/content change into a spurious extra undo step
// (same reasoning as Prompt 11's original measurement system); the
// combination with the item's own stored size happens in the component
// below, entirely in local/derived state.
function useMinContentSize(active) {
  const minRef = useRef(null);
  const wrapRef = useRef(null);
  const [minWidth, setMinWidth] = useState(null);
  const [wrappedHeight, setWrappedHeight] = useState(null);

  useLayoutEffect(() => {
    if (!active) return undefined;
    const node = minRef.current;
    if (!node) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setMinWidth((prev) => (prev !== null && Math.abs(prev - w) < 0.5 ? prev : w));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [active]);

  useLayoutEffect(() => {
    if (!active) return undefined;
    const node = wrapRef.current;
    if (!node) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      setWrappedHeight((prev) => (prev !== null && Math.abs(prev - h) < 0.5 ? prev : h));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [active]);

  return { minRef, wrapRef, minWidth: active ? minWidth : null, wrappedHeight: active ? wrappedHeight : null };
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
function ContentBody({ item, isPartSelected, onSelectPart, isPartHovered, onPartHoverEnter, onPartHoverLeave, onPartContextMenu }) {
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
            className={`item__label${isPartSelected('label') ? ' item__label--selected' : isPartHovered('label') ? ' item__label--hover' : ''}`}
            style={labelStyle}
            onClick={(e) => onSelectPart(e, 'label')}
            onMouseEnter={(e) => onPartHoverEnter(e, 'label')}
            onMouseLeave={(e) => onPartHoverLeave(e, 'label')}
            onContextMenu={(e) => onPartContextMenu(e, 'label')}
          >
            {data.label}
          </span>
          <span
            className={`item__value${isPartSelected('value') ? ' item__value--selected' : isPartHovered('value') ? ' item__value--hover' : ''}`}
            style={valueStyle}
            onClick={(e) => onSelectPart(e, 'value')}
            onMouseEnter={(e) => onPartHoverEnter(e, 'value')}
            onMouseLeave={(e) => onPartHoverLeave(e, 'value')}
            onContextMenu={(e) => onPartContextMenu(e, 'value')}
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
            className={`item__block-title${isPartSelected('title') ? ' item__block-title--selected' : isPartHovered('title') ? ' item__block-title--hover' : ''}`}
            style={titleStyle}
            onClick={(e) => onSelectPart(e, 'title')}
            onMouseEnter={(e) => onPartHoverEnter(e, 'title')}
            onMouseLeave={(e) => onPartHoverLeave(e, 'title')}
            onContextMenu={(e) => onPartContextMenu(e, 'title')}
          >
            {data.title.text}
          </div>
          {visibleLines.map((line) => (
            <div
              className={`item__block-line${isPartSelected(line.key) ? ' item__block-line--selected' : isPartHovered(line.key) ? ' item__block-line--hover' : ''}`}
              style={partInlineStyle(item, line.key, '#55524a', undefined, 9)}
              key={line.key}
              onClick={(e) => onSelectPart(e, line.key)}
              onMouseEnter={(e) => onPartHoverEnter(e, line.key)}
              onMouseLeave={(e) => onPartHoverLeave(e, line.key)}
              onContextMenu={(e) => onPartContextMenu(e, line.key)}
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
            className={`item__block-title${isPartSelected('title') ? ' item__block-title--selected' : isPartHovered('title') ? ' item__block-title--hover' : ''}`}
            style={titleStyle}
            onClick={(e) => onSelectPart(e, 'title')}
            onMouseEnter={(e) => onPartHoverEnter(e, 'title')}
            onMouseLeave={(e) => onPartHoverLeave(e, 'title')}
            onContextMenu={(e) => onPartContextMenu(e, 'title')}
          >
            {data.label}
          </div>
          <div
            className={`item__qr-wrap${isPartSelected('body') ? ' item__qr-wrap--selected' : isPartHovered('body') ? ' item__qr-wrap--hover' : ''}`}
            style={{
              background: bodyBoxStyle.background,
              borderColor: bodyBoxStyle.borderColor,
              borderWidth: bodyBoxStyle.borderWidth,
              borderStyle: bodyBoxStyle.borderStyle,
            }}
            onClick={(e) => onSelectPart(e, 'body')}
            onMouseEnter={(e) => onPartHoverEnter(e, 'body')}
            onMouseLeave={(e) => onPartHoverLeave(e, 'body')}
            onContextMenu={(e) => onPartContextMenu(e, 'body')}
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
            <WordmarkSVG width={56} height={8.4} align="center" />
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
  const {
    template,
    selection,
    setSelection,
    updateItem,
    setEdgeHighlight,
    setGuides,
    effectiveSizes,
    setEffectiveSize,
    setContextMenu,
  } = useEditor();
  const def = item.kind === 'content' ? ELEMENT_TYPES[item.type] : null;

  const isSelected = !readOnly && selection.ids.includes(item.id);
  const isPartSelected = (part) =>
    !readOnly && !!selection.part && selection.part.id === item.id && selection.part.key === part;
  const isWholeSelected = isSelected && !(selection.part && selection.part.id === item.id);

  const [live, setLive] = useState(null); // { x, y, width, height, rotation } while dragging
  const [rotationSnapped, setRotationSnapped] = useState(false);
  const draggedRef = useRef(false); // did the current mousedown gesture actually move?

  // Hover preview (Prompt 15) — local, transient, cleared the instant the
  // cursor leaves; never touches selection state. `hoverWhole` tracks the
  // outer frame's own mouseenter/leave (native mouseenter/leave don't
  // bubble, so this stays true while the cursor is anywhere inside the
  // item, sub-parts included, and only flips false on actually leaving
  // the item). `hoveredPart` tracks whichever sub-part's OWN
  // mouseenter/leave last fired, taking priority over the whole-item
  // preview the same way a click on a part takes priority over a
  // whole-item click.
  const [hoverWhole, setHoverWhole] = useState(false);
  const [hoveredPart, setHoveredPart] = useState(null);
  const isPartHovered = (part) => hoveredPart === part;
  const onPartHoverEnter = (e, part) => setHoveredPart(part);
  const onPartHoverLeave = (e, part) => setHoveredPart((prev) => (prev === part ? null : prev));

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

  // Prompt 14: the box a text variant actually renders (and the one other
  // items' collision checks must respect) is current.width/height grown
  // just enough to contain its own measured content — never smaller than
  // what's stored, only ever larger when the content needs more room.
  const { minRef, wrapRef, minWidth, wrappedHeight } = useMinContentSize(isTextVariant);
  const effectiveWidth = isTextVariant ? Math.max(current.width, minWidth ?? current.width) : current.width;
  const effectiveHeight = isTextVariant ? Math.max(current.height, wrappedHeight ?? current.height) : current.height;

  useEffect(() => {
    if (isTextVariant) setEffectiveSize(item.id, { width: effectiveWidth, height: effectiveHeight });
  }, [isTextVariant, item.id, effectiveWidth, effectiveHeight, setEffectiveSize]);

  const scaleWrapperWidth = isTextVariant ? effectiveWidth : item.naturalWidth;
  const scaleWrapperHeight = isTextVariant ? effectiveHeight : item.naturalHeight;

  // Collision must react to what's actually on screen, not a stale stored
  // size — a neighbor's own grown (Prompt 14) box, when it has one, is
  // what beginMove/beginResize below build their neighbor list from.
  const withEffectiveSize = (o) => {
    const eff = effectiveSizes[o.id];
    return eff ? { ...o, width: eff.width, height: eff.height } : o;
  };

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
      item.kind === 'content' ? collisionBoxes(others.filter((o) => o.kind === 'content').map(withEffectiveSize)) : null;
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
    // A sub-part being selected doesn't hide the whole item's handles
    // (Prompt 15 — internal padding is tight enough that "click empty
    // space to select the container" was often unreachable) — grabbing
    // one both performs the resize AND switches selection to the whole
    // item, so there's no intermediate step required first.
    if (selection.part) setSelection({ ids: [item.id], part: null });
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
      item.kind === 'content' ? collisionBoxes(others.filter((o) => o.kind === 'content').map(withEffectiveSize)) : null;
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
    if (selection.part) setSelection({ ids: [item.id], part: null });
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

  // Right-click (Prompt 15). `part` is the specific sub-part right-
  // clicked, or null for the whole item. If this item is already part of
  // the current selection (whole or multi), that selection is left alone
  // — right-clicking one of several selected items shows the
  // intersection-of-actions menu for all of them, not a reset to just
  // this one. Otherwise it becomes the new (single) selection first, same
  // as a left-click would, so the menu that follows always matches what's
  // actually selected.
  const beginContextMenu = (e, part) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selection.ids.includes(item.id)) {
      setSelection({ ids: [item.id], part: part ? { id: item.id, key: part } : null });
    } else if (part && !(selection.part && selection.part.id === item.id && selection.part.key === part)) {
      setSelection({ ids: [item.id], part: { id: item.id, key: part } });
    }
    setContextMenu({ x: e.clientX, y: e.clientY });
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
  // actually rendered inside it — `item.cornerRadius`, a universal
  // per-item style property (Prompt 15) defaulting to 0 for every content
  // type (Logo/Signature/QR and every text-bearing variant included, not
  // just the table it started as) — the shape's own radius (including the
  // ellipse/line special cases) for shapes — otherwise a round shape
  // would get a square selection box.
  const frameStyle =
    item.kind === 'content'
      ? {
          borderRadius: item.cornerRadius ?? 0,
          borderColor: item.borderColor,
          borderWidth: item.borderWidth ? `${item.borderWidth}px` : undefined,
          borderStyle: item.borderWidth ? 'solid' : undefined,
          color: item.textColor,
          background: item.bgColor,
        }
      : { borderRadius: shapeBorderRadius(item) };

  // Only preview the WHOLE item's outline when nothing about it is
  // already selected (whole or part — either one already renders
  // .item--selected on this same frame, so a second, lighter outline on
  // top would just be visual noise) and no sub-part is the one actually
  // being hovered right now (that takes priority, same as clicks do).
  const showHoverWhole = !readOnly && hoverWhole && hoveredPart === null && !isSelected;

  return (
    <div
      className={`item item--${item.kind}${def ? ` item--${def.variant}` : ''}${isSelected ? ' item--selected' : ''}${showHoverWhole ? ' item--hover-preview' : ''}`}
      style={{
        position: 'absolute',
        left: current.x,
        top: current.y,
        // The item's own border/background/selection-outline all live on
        // THIS frame, so growing it (not just the inner `.item__scale`) is
        // what makes an under-sized text box visually contain its content
        // instead of just having the content spill past an unchanged
        // border (Prompt 14).
        width: effectiveWidth,
        height: effectiveHeight,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        cursor: readOnly ? 'default' : item.locked ? 'default' : 'grab',
        ...frameStyle,
      }}
      onMouseDown={readOnly ? undefined : beginMove}
      onContextMenu={readOnly ? undefined : (e) => beginContextMenu(e, null)}
      onMouseEnter={readOnly ? undefined : () => setHoverWhole(true)}
      onMouseLeave={
        readOnly
          ? undefined
          : () => {
              setHoverWhole(false);
              setHoveredPart(null);
            }
      }
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
          <ContentBody
            item={current}
            isPartSelected={isPartSelected}
            onSelectPart={readOnly ? NOOP : handlePartClick}
            isPartHovered={readOnly ? NOOP : isPartHovered}
            onPartHoverEnter={readOnly ? NOOP : onPartHoverEnter}
            onPartHoverLeave={readOnly ? NOOP : onPartHoverLeave}
            onPartContextMenu={readOnly ? NOOP : beginContextMenu}
          />
        )}
      </div>

      {isTextVariant && (
        <>
          <div
            ref={minRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              visibility: 'hidden',
              pointerEvents: 'none',
              zIndex: -1,
              width: def.variant && WRAPPING_VARIANTS.has(def.variant) ? 'min-content' : undefined,
            }}
          >
            <ContentBody item={current} isPartSelected={() => false} onSelectPart={() => {}} isPartHovered={() => false} onPartHoverEnter={() => {}} onPartHoverLeave={() => {}} onPartContextMenu={() => {}} />
          </div>
          <div
            ref={wrapRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              visibility: 'hidden',
              pointerEvents: 'none',
              zIndex: -1,
              width: Math.max(current.width, minWidth ?? current.width),
            }}
          >
            <ContentBody item={current} isPartSelected={() => false} onSelectPart={() => {}} isPartHovered={() => false} onPartHoverEnter={() => {}} onPartHoverLeave={() => {}} onPartContextMenu={() => {}} />
          </div>
        </>
      )}

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

      {isSelected && !item.locked && (() => {
        // "left/right/top/bottom" only stays well-defined for an
        // unrotated item — a rotated one just keeps the fixed offset
        // (Infinity clearance on every side is adaptiveHandleOffset's
        // no-neighbor fallback, so this reuses the exact same call).
        const clearance =
          rotation === 0
            ? edgeClearance(item, template.items.filter((i) => i.id !== item.id).map(withEffectiveSize))
            : { left: Infinity, right: Infinity, top: Infinity, bottom: Infinity };
        return (
          <>
            {RESIZE_HANDLES.map((h) => (
              <div
                key={h.key}
                className="item__resize-handle"
                style={{
                  left: `calc(${h.fx * 100}% + ${adaptiveHandleOffset(h.fx, clearance.left, clearance.right)}px)`,
                  top: `calc(${h.fy * 100}% + ${adaptiveHandleOffset(h.fy, clearance.top, clearance.bottom)}px)`,
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
        );
      })()}
    </div>
  );
}
