import React from 'react';
import { useEditor } from '../../state/EditorContext';
import { ELEMENT_TYPES } from '../../data/elementCatalog';
import { getItemBounds, getFooterTop, resolveMoveCollision } from '../../utils/geometry';
import { FONT_FAMILIES, FONT_WEIGHT_LABELS, fontFamilyById } from '../../data/fonts';

// Variants whose text is split into independently-styleable parts (see
// item[part] in CanvasItem.jsx) — kept in sync with CanvasItem:
//   block/qr:     'title' + per-line keys ('body' for qr's image half)
//   label-value:  'label' + 'value' (Due Date / Issue Date)
const SUB_PART_VARIANTS = new Set(['block', 'qr', 'label-value']);

// Variants where "how content sits inside its own box" is a meaningful,
// independent choice — distinct from the page-alignment buttons below,
// which move the box itself. `table` cells have their own per-column
// left/right rule, so it's left out entirely; a `spread` label-value item
// (Subtotal etc.) already spreads label/value with `justify-content:
// space-between`, so it only loses the HORIZONTAL control (see showHAlign
// below) — vertical position doesn't fight the spread, so it keeps that
// one.
const ALIGNABLE_VARIANTS = new Set(['text', 'note', 'block', 'label-value']);

const H_ALIGN_OPTIONS = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
const V_ALIGN_OPTIONS = [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']];

// ---------- Shared field widgets ----------
// Every item-type panel below is built from the same small set of row
// widgets, assembled in the same category order (Prompt 23 item 9):
// Position/Size/Rotation, Fill/Border/Radius, Typography, Alignment
// (content + page), then whatever's type-specific, last.

// Prompt 23 item 7: every slider pairs with an exact-value numeric input —
// dragging the slider updates the number, typing the number updates the
// slider, both drive the same `onChange`. Used everywhere a px-valued
// slider exists (border width, corner radius, cell padding, ...); NOT used
// for rotation (degrees, not px — out of this control's scope).
function SliderRow({ label, min, max, step = 1, value, onChange }) {
  const handle = (e) => {
    const v = Number(e.target.value);
    if (!Number.isNaN(v)) onChange(v);
  };
  return (
    <div className="prop-row">
      <label>{label}</label>
      <div className="slider-with-input">
        <input type="range" min={min} max={max} step={step} value={value} onChange={handle} />
        <input type="number" min={min} max={max} step={step} value={value} onChange={handle} />
      </div>
    </div>
  );
}

// Font-family + font-weight + font-size controls, shared by whole-item and
// per-part property panels alike. `style` is whatever flat style object (an
// item, or an item[part]) already holds textColor/bgColor/etc; `onChange`
// gets just the font patch to merge in the same way those other controls
// do. `defaultSize` is that variant/part's own baked-in CSS size (see the
// matching fallback passed to fontStyle()/partInlineStyle() in
// CanvasItem.jsx) — shown until the user picks an explicit override.
function FontControls({ style, onChange, defaultSize }) {
  const currentFamily = fontFamilyById(style.fontFamily);
  const weights = currentFamily.weights;
  const currentWeight = style.fontWeight && weights.includes(style.fontWeight) ? style.fontWeight : weights[0];

  return (
    <>
      <div className="prop-row">
        <label>Font</label>
        <select
          value={currentFamily.id}
          onChange={(e) => {
            const next = FONT_FAMILIES.find((f) => f.id === e.target.value);
            onChange({ fontFamily: next.id, fontWeight: next.weights[0] });
          }}
        >
          {FONT_FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>
      <div className="prop-row">
        <label>Weight</label>
        <select value={currentWeight} onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}>
          {weights.map((w) => <option key={w} value={w}>{FONT_WEIGHT_LABELS[w]}</option>)}
        </select>
      </div>
      <div className="prop-row">
        <label>Size</label>
        <input
          type="number"
          min="6"
          max="72"
          value={style.fontSize || defaultSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
        />
      </div>
    </>
  );
}

// Left/center/right (horizontal, text-align/justify-content) or top/
// middle/bottom (vertical, Prompt 13 — the outer `.item__scale` flex
// wrapper's justify-content, since text no longer scales to fill its box)
// — how content sits inside its own box, applied to the WHOLE item (not
// per-part; block's per-line horizontal override, when wanted, is set
// from PartProperties instead — vertical has no per-part equivalent,
// block's lines move together as one group).
function ContentAlignControl({ label, options, value, defaultValue, onChange }) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      <div className="align-grid" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map(([v, text]) => (
          <button
            key={v}
            className="tbtn"
            style={{ fontWeight: (value || defaultValue) === v ? 700 : 400 }}
            onClick={() => onChange(v)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

// Repositions an item against the PAGE's own width/height — never relative
// to other items — respecting the same kind-aware boundary each item
// already can't cross (getItemBounds: true edge for a shape, PAGE_PADDING
// inset for content). Content items route through the exact same
// cascading-push resolution a drag uses (resolveMoveCollision): aligning
// pushes whatever is in the way rather than landing on top of it. Shapes
// stay exempt, same as everywhere else collision applies.
function PageAlignButtons({ item }) {
  const { template, updateItem, updateItems, effectiveSizes } = useEditor();
  const bounds = getItemBounds(item, template.page, getFooterTop(template.items, template.page));

  const moveTo = (x, y) => {
    if (item.kind !== 'content') {
      updateItem(item.id, { x, y });
      return;
    }
    const withEffectiveSize = (o) => {
      const eff = effectiveSizes[o.id];
      return eff ? { ...o, width: eff.width, height: eff.height } : o;
    };
    const neighbors = template.items
      .filter((i) => i.id !== item.id && i.kind === 'content')
      .map(withEffectiveSize);
    const resolved = resolveMoveCollision(
      { x: item.x, y: item.y },
      { x, y },
      { width: item.width, height: item.height },
      item.rotation || 0,
      neighbors,
      bounds
    );
    if (resolved.pushed.size > 0) {
      const ids = [item.id, ...resolved.pushed.keys()];
      updateItems(ids, (i) => (i.id === item.id ? { x: resolved.x, y: resolved.y } : resolved.pushed.get(i.id)));
    } else {
      updateItem(item.id, { x: resolved.x, y: resolved.y });
    }
  };

  const alignX = (mode) => {
    const x =
      mode === 'left' ? bounds.minX : mode === 'right' ? bounds.maxX - item.width : (bounds.minX + bounds.maxX - item.width) / 2;
    moveTo(x, item.y);
  };
  const alignY = (mode) => {
    const y =
      mode === 'top' ? bounds.minY : mode === 'bottom' ? bounds.maxY - item.height : (bounds.minY + bounds.maxY - item.height) / 2;
    moveTo(item.x, y);
  };

  return (
    <div className="align-grid">
      <button className="tbtn" onClick={() => alignX('left')}>Left</button>
      <button className="tbtn" onClick={() => alignX('center')}>Center</button>
      <button className="tbtn" onClick={() => alignX('right')}>Right</button>
      <button className="tbtn" onClick={() => alignY('top')}>Top</button>
      <button className="tbtn" onClick={() => alignY('middle')}>Middle</button>
      <button className="tbtn" onClick={() => alignY('bottom')}>Bottom</button>
    </div>
  );
}

// Prompt 23 item 9: one shared "Alignment" section — content alignment
// (how content sits inside its own box) followed by page alignment (where
// the box itself sits on the page), in that order, under a single title —
// applies uniformly to content items, shape items, and (via its own
// smaller call below) a selected sub-part's whole container.
function AlignmentSection({ hAlign, vAlign, pageAlignItem }) {
  if (!hAlign && !vAlign && !pageAlignItem) return null;
  return (
    <>
      <div className="panel__section-title">Alignment</div>
      {hAlign}
      {vAlign}
      {pageAlignItem && <PageAlignButtons item={pageAlignItem} />}
    </>
  );
}

// Which label to show for a sub-part in its own panel, and whether it's
// individually deletable — the only deletable parts are optional block
// lines (Prompt 5); label/value (Due Date, Issue Date) and qr's title/body
// are fixed content, styleable but never removable.
function partMeta(def, part) {
  if (part === 'title') return { label: 'Title', deletable: false };
  if (def.variant === 'block') {
    const line = def.render().lines.find((l) => l.key === part);
    return { label: line?.label || 'Body', deletable: !!line && !line.required, required: line?.required };
  }
  if (def.variant === 'label-value') {
    return { label: part === 'label' ? 'Label' : 'Value', deletable: false };
  }
  return { label: 'Body', deletable: false }; // qr's image half
}

// Part-level font-size fallback: label-value's two spans share its
// container size (11 for a `strong` item like Total due, 10 otherwise),
// title uses the block-title 8px default, everything else is a block body
// line at 9px — mirrors the fallbacks CanvasItem.jsx's ContentBody passes
// to partInlineStyle() for the same parts.
function partDefaultFontSize(def, part) {
  if (def.variant === 'label-value') return def.strong ? 11 : 10;
  if (part === 'title') return 8;
  return 9;
}

function PartProperties({ item, part, pageAlignItem }) {
  const { updateItemPart, deleteBlockLine } = useEditor();
  const def = ELEMENT_TYPES[item.type];
  const meta = partMeta(def, part);
  const partStyle = item[part] || {};
  const defaultColor = part === 'title' ? '#a2896b' : '#55524a';

  return (
    <>
      <div className="panel__section-title">
        {def.label} — {meta.label}
      </div>

      <div className="panel__section-title">Fill &amp; border</div>
      <div className="prop-row">
        <label>Background</label>
        <input type="color" value={partStyle.bgColor || '#faf9f6'} onChange={(e) => updateItemPart(item.id, part, { bgColor: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>Border color</label>
        <input type="color" value={partStyle.borderColor || '#262420'} onChange={(e) => updateItemPart(item.id, part, { borderColor: e.target.value })} />
      </div>
      <SliderRow label="Border width" min={0} max={6} value={partStyle.borderWidth || 0} onChange={(v) => updateItemPart(item.id, part, { borderWidth: v })} />

      <div className="panel__section-title">Typography</div>
      <div className="prop-row">
        <label>Text color</label>
        <input type="color" value={partStyle.textColor || defaultColor} onChange={(e) => updateItemPart(item.id, part, { textColor: e.target.value })} />
      </div>
      <FontControls
        style={partStyle}
        onChange={(patch) => updateItemPart(item.id, part, patch)}
        defaultSize={partDefaultFontSize(def, part)}
      />

      <AlignmentSection
        hAlign={
          def.variant === 'block' && (
            <ContentAlignControl
              label="Align"
              options={H_ALIGN_OPTIONS}
              defaultValue="left"
              value={partStyle.contentAlign}
              onChange={(v) => updateItemPart(item.id, part, { contentAlign: v })}
            />
          )
        }
        pageAlignItem={pageAlignItem}
      />

      {meta.deletable && (
        <button className="tbtn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => deleteBlockLine(item.id, part)}>
          Delete this line
        </button>
      )}
      {!meta.deletable && def.variant === 'block' && part !== 'title' && (
        <p className="empty-hint">This line is required and can't be removed.</p>
      )}
    </>
  );
}

// Whole-item font-size fallback per variant — mirrors the fallbacks
// CanvasItem.jsx's ContentBody passes to fontStyle() for that same variant.
// (`label-value` never reaches this: it's a SUB_PART_VARIANT, so
// hideTextControls suppresses the whole-item font row entirely — table's
// own dedicated panel below has its own header-size field, but body font
// size is this same generic control now — see Prompt 23 item 10.)
function variantDefaultFontSize(variant) {
  if (variant === 'table') return 8.5;
  if (variant === 'footer') return 7;
  return 10; // text, note
}

function ContentProperties({ items, pageAlignItem }) {
  const { updateItems } = useEditor();
  const ids = items.map((i) => i.id);
  const first = items[0];
  // block/qr/label-value's own text lives in their sub-parts (styled via
  // PartProperties instead) — the whole-item selection here only covers
  // their outer card (background/border), not a font a whole-item control
  // would even apply to. Every other variant is a single flat text run,
  // where the whole-item controls ARE the text controls — except
  // 'divider', which has no text at all (its color is the Background
  // control below, matching how the shape-line's color works), and
  // 'image', whose Logo/Signature types now render a real asset rather
  // than a currentColor-recolorable mark — text color and font no longer
  // apply to either. Background/border stay available regardless.
  const firstVariant = ELEMENT_TYPES[first.type].variant;
  const hideTextControls =
    items.length === 1 && (SUB_PART_VARIANTS.has(firstVariant) || firstVariant === 'divider' || firstVariant === 'image');
  const showHAlign = ALIGNABLE_VARIANTS.has(firstVariant) && !ELEMENT_TYPES[first.type].spread;
  const showVAlign = ALIGNABLE_VARIANTS.has(firstVariant);

  return (
    <>
      <div className="panel__section-title">
        {items.length > 1 ? `${items.length} elements selected` : ELEMENT_TYPES[first.type].label}
      </div>

      {/* Fill / Border / Radius — universal (Prompt 15): every content
          item renders a frame that can take a background/border/radius,
          Logo/Signature/QR included, since their border/background live
          on this same outer frame (see CanvasItem.jsx's frameStyle). */}
      <div className="panel__section-title">Fill &amp; border</div>
      <div className="prop-row">
        <label>Background</label>
        <input type="color" value={first.bgColor || '#faf9f6'} onChange={(e) => updateItems(ids, () => ({ bgColor: e.target.value }))} />
      </div>
      <div className="prop-row">
        <label>Border color</label>
        <input type="color" value={first.borderColor || '#262420'} onChange={(e) => updateItems(ids, () => ({ borderColor: e.target.value }))} />
      </div>
      <SliderRow label="Border width" min={0} max={6} value={first.borderWidth || 0} onChange={(v) => updateItems(ids, () => ({ borderWidth: v }))} />
      <SliderRow label="Corner radius" min={0} max={24} value={first.cornerRadius ?? 0} onChange={(v) => updateItems(ids, () => ({ cornerRadius: v }))} />

      {!hideTextControls && (
        <>
          <div className="panel__section-title">Typography</div>
          <div className="prop-row">
            <label>Text color</label>
            <input type="color" value={first.textColor || '#262420'} onChange={(e) => updateItems(ids, () => ({ textColor: e.target.value }))} />
          </div>
          <FontControls
            style={first}
            onChange={(patch) => updateItems(ids, () => patch)}
            defaultSize={variantDefaultFontSize(firstVariant)}
          />
        </>
      )}

      <AlignmentSection
        hAlign={
          showHAlign && (
            <ContentAlignControl
              label="Align"
              options={H_ALIGN_OPTIONS}
              defaultValue="left"
              value={first.contentAlign}
              onChange={(v) => updateItems(ids, () => ({ contentAlign: v }))}
            />
          )
        }
        vAlign={
          showVAlign && (
            <ContentAlignControl
              label="Vertical"
              options={V_ALIGN_OPTIONS}
              defaultValue="top"
              value={first.contentAlignY}
              onChange={(v) => updateItems(ids, () => ({ contentAlignY: v }))}
            />
          )
        }
        pageAlignItem={pageAlignItem}
      />
    </>
  );
}

// Table-only controls (per the elementCatalog.js type key, gated to that
// one item type, not generalized into the generic item panels above) —
// header row styling, row borders/shading, corner radius. Column widths
// are dragged directly on the canvas (the divider handles in
// CanvasItem.jsx); this just points that out, there's no width input here.
//
// Prompt 23 item 10: body font size used to have its OWN input here,
// editing the exact same `item.fontSize` field the generic Typography
// section's "Size" control (above, in ContentProperties) already edits —
// a literal duplicate. Removed here; the generic control is now the one
// place that sets it.
function TableProperties({ item }) {
  const { updateItem } = useEditor();
  const patch = (p) => updateItem(item.id, p);
  const headerWeights = fontFamilyById(item.fontFamily).weights;

  return (
    <>
      <div className="panel__section-title">Table — Header row</div>
      <div className="prop-row">
        <label>Background</label>
        <input type="color" value={item.headerBg || '#faf9f6'} onChange={(e) => patch({ headerBg: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>Text color</label>
        <input type="color" value={item.headerTextColor || '#262420'} onChange={(e) => patch({ headerTextColor: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>Weight</label>
        <select value={item.headerFontWeight || headerWeights[headerWeights.length - 1]} onChange={(e) => patch({ headerFontWeight: Number(e.target.value) })}>
          {headerWeights.map((w) => <option key={w} value={w}>{FONT_WEIGHT_LABELS[w]}</option>)}
        </select>
      </div>
      <div className="prop-row">
        <label>Size</label>
        <input type="number" min="6" max="72" value={item.headerFontSize || 7} onChange={(e) => patch({ headerFontSize: Number(e.target.value) })} />
      </div>

      <div className="panel__section-title">Table — Body rows</div>
      <div className="prop-row">
        <label>Row border color</label>
        <input type="color" value={item.rowBorderColor || '#e5e1d6'} onChange={(e) => patch({ rowBorderColor: e.target.value })} />
      </div>
      <SliderRow label="Row border width" min={0} max={3} step={0.5} value={item.rowBorderWidth ?? 0.5} onChange={(v) => patch({ rowBorderWidth: v })} />
      <div className="prop-row">
        <label>Alternating shading</label>
        <input type="checkbox" checked={!!item.altRowShading} onChange={(e) => patch({ altRowShading: e.target.checked })} />
      </div>
      {item.altRowShading && (
        <div className="prop-row">
          <label>Shading color</label>
          <input type="color" value={item.altRowColor || '#f5f3ee'} onChange={(e) => patch({ altRowColor: e.target.value })} />
        </div>
      )}

      <div className="panel__section-title">Table — Columns</div>
      <SliderRow label="Cell padding" min={0} max={16} value={item.cellPadding ?? 4} onChange={(v) => patch({ cellPadding: v })} />
      {ELEMENT_TYPES[item.type].render().columns.map((col, j) => {
        const align = item.columnAlign?.[j] || (j === 0 ? 'left' : 'right');
        const setAlign = (v) => {
          const next = [...(item.columnAlign || ELEMENT_TYPES[item.type].render().columns.map((_, i) => (i === 0 ? 'left' : 'right')))];
          next[j] = v;
          patch({ columnAlign: next });
        };
        return (
          <div className="prop-row" key={col}>
            <label>{col}</label>
            <div className="align-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {['left', 'center', 'right'].map((v) => (
                <button key={v} className="tbtn" style={{ fontWeight: align === v ? 700 : 400 }} onClick={() => setAlign(v)}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <p className="empty-hint">Drag the thin dividers on the table itself to resize individual columns.</p>
    </>
  );
}

// Footer-only controls (gated to that one item type, same pattern as
// Prompt 8's table controls). Text color and background are already
// covered by the generic ContentProperties above (which now works for the
// footer since it became selectable) — this just adds the one control
// that's genuinely new: the divider rule above the footer.
function FooterProperties({ item }) {
  const { updateItem } = useEditor();

  return (
    <>
      <div className="panel__section-title">Footer — Divider</div>
      <div className="prop-row">
        <label>Divider color</label>
        <input type="color" value={item.dividerColor || '#e5e1d6'} onChange={(e) => updateItem(item.id, { dividerColor: e.target.value })} />
      </div>
    </>
  );
}

function PageProperties() {
  const { template, updatePageBackground } = useEditor();

  return (
    <>
      <div className="panel__section-title">Page</div>
      <div className="prop-row">
        <label>Background</label>
        <input type="color" value={template.page.backgroundColor} onChange={(e) => updatePageBackground(e.target.value)} />
      </div>
    </>
  );
}

function ShapeProperties({ items, pageAlignItem }) {
  const { updateItems } = useEditor();
  const ids = items.map((i) => i.id);
  const first = items[0];

  return (
    <>
      <div className="panel__section-title">{items.length > 1 ? `${items.length} shapes selected` : 'Shape'}</div>

      <div className="panel__section-title">Position &amp; size</div>
      <div className="prop-row">
        <label>Width</label>
        <input type="number" value={Math.round(first.width)} onChange={(e) => updateItems(ids, () => ({ width: Number(e.target.value) }))} />
      </div>
      <div className="prop-row">
        <label>Height</label>
        <input type="number" value={Math.round(first.height)} onChange={(e) => updateItems(ids, () => ({ height: Number(e.target.value) }))} />
      </div>
      <SliderRow label="Rotation" min={-180} max={180} value={first.rotation} onChange={(v) => updateItems(ids, () => ({ rotation: v }))} />

      <div className="panel__section-title">Fill &amp; border</div>
      <div className="prop-row">
        <label>Fill</label>
        <input type="color" value={first.fill} onChange={(e) => updateItems(ids, () => ({ fill: e.target.value }))} />
      </div>
      <div className="prop-row">
        <label>Border color</label>
        <input type="color" value={first.borderColor === 'transparent' ? '#000000' : first.borderColor} onChange={(e) => updateItems(ids, () => ({ borderColor: e.target.value }))} />
      </div>
      <SliderRow label="Border width" min={0} max={8} value={first.borderWidth} onChange={(v) => updateItems(ids, () => ({ borderWidth: v }))} />
      {first.type === 'roundedRect' && (
        <SliderRow label="Corner radius" min={0} max={60} value={first.radius} onChange={(v) => updateItems(ids, () => ({ radius: v }))} />
      )}

      <AlignmentSection pageAlignItem={pageAlignItem} />
    </>
  );
}

export default function PropertiesPanel() {
  const { template, selection, saveState } = useEditor();
  const selectedItems = template.items.filter((i) => selection.ids.includes(i.id));
  const partItem = selection.part ? template.items.find((i) => i.id === selection.part.id) : null;
  const kinds = new Set(selectedItems.map((i) => i.kind));
  const singleItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const pageAlignItem = singleItem && !singleItem.locked ? singleItem : null;

  return (
    <div className="panel panel--right">
      {partItem && SUB_PART_VARIANTS.has(ELEMENT_TYPES[partItem.type].variant) ? (
        <PartProperties item={partItem} part={selection.part.key} pageAlignItem={pageAlignItem} />
      ) : (
        <>
          {selectedItems.length > 0 && kinds.size === 1 && kinds.has('content') && (
            <>
              <ContentProperties items={selectedItems} pageAlignItem={pageAlignItem} />
              {selectedItems.length === 1 && selectedItems[0].type === 'itemsTable' && (
                <TableProperties item={selectedItems[0]} />
              )}
              {selectedItems.length === 1 && selectedItems[0].type === 'footer' && (
                <FooterProperties item={selectedItems[0]} />
              )}
            </>
          )}
          {selectedItems.length > 0 && kinds.size === 1 && kinds.has('shape') && (
            <ShapeProperties items={selectedItems} pageAlignItem={pageAlignItem} />
          )}
          {selectedItems.length > 0 && kinds.size > 1 && (
            <div className="panel__section-title">{selectedItems.length} items selected (mixed)</div>
          )}
        </>
      )}
      {selectedItems.length === 0 && (
        <>
          <PageProperties />
          <p className="empty-hint" style={{ marginTop: 14 }}>
            Select a content element or shape on the canvas to edit its style here.
          </p>
        </>
      )}

      {saveState.status !== 'idle' && (
        <div className="validation-list">
          <div className="panel__section-title" style={{ margin: 0, marginBottom: 8 }}>
            {saveState.status === 'saved' ? 'Saved ✓' : 'Fix before saving'}
          </div>
          {saveState.issues.map((issue, i) => (
            <div key={i} className={`validation-item validation-item--${issue.level}`}>
              <span>{issue.level === 'error' ? '⛔' : '⚠️'}</span>
              <span>{issue.message}</span>
            </div>
          ))}
          {saveState.status === 'saved' && saveState.issues.length === 0 && (
            <div className="validation-item" style={{ color: 'var(--success)' }}>Template passed all checks.</div>
          )}
        </div>
      )}
    </div>
  );
}
