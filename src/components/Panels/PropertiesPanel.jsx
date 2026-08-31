import React from 'react';
import { useEditor } from '../../state/EditorContext';
import { ELEMENT_TYPES } from '../../data/elementCatalog';
import { getItemBounds } from '../../utils/geometry';
import { FONT_FAMILIES, FONT_WEIGHT_LABELS, fontFamilyById } from '../../data/fonts';

// Variants whose text is split into independently-styleable parts (see
// item[part] in CanvasItem.jsx) — kept in sync with CanvasItem:
//   block/qr:     'title' + per-line keys ('body' for qr's image half)
//   label-value:  'label' + 'value' (Due Date / Issue Date)
const SUB_PART_VARIANTS = new Set(['block', 'qr', 'label-value']);

// Font-family + font-weight controls, shared by whole-item and per-part
// property panels alike. `style` is whatever flat style object (an item,
// or an item[part]) already holds textColor/bgColor/etc; `onChange` gets
// just the font patch to merge in the same way those other controls do.
function FontControls({ style, onChange }) {
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

function PartProperties({ item, part }) {
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
      <div className="prop-row">
        <label>Text color</label>
        <input type="color" value={partStyle.textColor || defaultColor} onChange={(e) => updateItemPart(item.id, part, { textColor: e.target.value })} />
      </div>
      <FontControls style={partStyle} onChange={(patch) => updateItemPart(item.id, part, patch)} />
      <div className="prop-row">
        <label>Background</label>
        <input type="color" value={partStyle.bgColor || '#faf9f6'} onChange={(e) => updateItemPart(item.id, part, { bgColor: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>Border color</label>
        <input type="color" value={partStyle.borderColor || '#262420'} onChange={(e) => updateItemPart(item.id, part, { borderColor: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>Border width</label>
        <input type="range" min="0" max="6" value={partStyle.borderWidth || 0} onChange={(e) => updateItemPart(item.id, part, { borderWidth: Number(e.target.value) })} />
      </div>
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

function ContentProperties({ items }) {
  const { updateItems } = useEditor();
  const ids = items.map((i) => i.id);
  const first = items[0];
  // block/qr/label-value's own text lives in their sub-parts (styled via
  // PartProperties instead) — the whole-item selection here only covers
  // their outer card (background/border), not a font a whole-item control
  // would even apply to. Every other variant is a single flat text run,
  // where the whole-item controls ARE the text controls.
  const hasSubParts = items.length === 1 && SUB_PART_VARIANTS.has(ELEMENT_TYPES[first.type].variant);

  return (
    <>
      <div className="panel__section-title">
        {items.length > 1 ? `${items.length} elements selected` : ELEMENT_TYPES[first.type].label}
      </div>
      {!hasSubParts && (
        <>
          <div className="prop-row">
            <label>Text color</label>
            <input type="color" value={first.textColor || '#262420'} onChange={(e) => updateItems(ids, () => ({ textColor: e.target.value }))} />
          </div>
          <FontControls style={first} onChange={(patch) => updateItems(ids, () => patch)} />
        </>
      )}
      <div className="prop-row">
        <label>Background</label>
        <input type="color" value={first.bgColor || '#faf9f6'} onChange={(e) => updateItems(ids, () => ({ bgColor: e.target.value }))} />
      </div>
      <div className="prop-row">
        <label>Border color</label>
        <input type="color" value={first.borderColor || '#262420'} onChange={(e) => updateItems(ids, () => ({ borderColor: e.target.value }))} />
      </div>
      <div className="prop-row">
        <label>Border width</label>
        <input type="range" min="0" max="6" value={first.borderWidth || 0} onChange={(e) => updateItems(ids, () => ({ borderWidth: Number(e.target.value) }))} />
      </div>
    </>
  );
}

// Repositions the item against the PAGE's own width/height — never
// relative to other items — respecting the same kind-aware boundary each
// item already can't cross (getItemBounds: true edge for a shape,
// PAGE_PADDING inset for content), so "Align Left" can't itself produce a
// position the boundary clamp would immediately have to correct.
function AlignmentControls({ item }) {
  const { template, updateItem } = useEditor();
  const bounds = getItemBounds(item, template.page);

  const alignX = (mode) => {
    const x =
      mode === 'left' ? bounds.minX : mode === 'right' ? bounds.maxX - item.width : (bounds.minX + bounds.maxX - item.width) / 2;
    updateItem(item.id, { x });
  };
  const alignY = (mode) => {
    const y =
      mode === 'top' ? bounds.minY : mode === 'bottom' ? bounds.maxY - item.height : (bounds.minY + bounds.maxY - item.height) / 2;
    updateItem(item.id, { y });
  };

  return (
    <>
      <div className="panel__section-title">Align</div>
      <div className="align-grid">
        <button className="tbtn" onClick={() => alignX('left')}>Left</button>
        <button className="tbtn" onClick={() => alignX('center')}>Center</button>
        <button className="tbtn" onClick={() => alignX('right')}>Right</button>
        <button className="tbtn" onClick={() => alignY('top')}>Top</button>
        <button className="tbtn" onClick={() => alignY('middle')}>Middle</button>
        <button className="tbtn" onClick={() => alignY('bottom')}>Bottom</button>
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

function ShapeProperties({ items }) {
  const { updateItems } = useEditor();
  const ids = items.map((i) => i.id);
  const first = items[0];

  return (
    <>
      <div className="panel__section-title">{items.length > 1 ? `${items.length} shapes selected` : 'Shape'}</div>
      <div className="prop-row">
        <label>Fill</label>
        <input type="color" value={first.fill} onChange={(e) => updateItems(ids, () => ({ fill: e.target.value }))} />
      </div>
      <div className="prop-row">
        <label>Border color</label>
        <input type="color" value={first.borderColor === 'transparent' ? '#000000' : first.borderColor} onChange={(e) => updateItems(ids, () => ({ borderColor: e.target.value }))} />
      </div>
      <div className="prop-row">
        <label>Border width</label>
        <input type="range" min="0" max="8" value={first.borderWidth} onChange={(e) => updateItems(ids, () => ({ borderWidth: Number(e.target.value) }))} />
      </div>
      {first.type === 'roundedRect' && (
        <div className="prop-row">
          <label>Corner radius</label>
          <input type="range" min="0" max="60" value={first.radius} onChange={(e) => updateItems(ids, () => ({ radius: Number(e.target.value) }))} />
        </div>
      )}
      <div className="prop-row">
        <label>Width</label>
        <input type="number" value={Math.round(first.width)} onChange={(e) => updateItems(ids, () => ({ width: Number(e.target.value) }))} />
      </div>
      <div className="prop-row">
        <label>Height</label>
        <input type="number" value={Math.round(first.height)} onChange={(e) => updateItems(ids, () => ({ height: Number(e.target.value) }))} />
      </div>
      <div className="prop-row">
        <label>Rotation</label>
        <input type="range" min="-180" max="180" value={first.rotation} onChange={(e) => updateItems(ids, () => ({ rotation: Number(e.target.value) }))} />
      </div>
    </>
  );
}

export default function PropertiesPanel() {
  const { template, selection, saveState } = useEditor();
  const selectedItems = template.items.filter((i) => selection.ids.includes(i.id));
  const partItem = selection.part ? template.items.find((i) => i.id === selection.part.id) : null;
  const kinds = new Set(selectedItems.map((i) => i.kind));
  const singleItem = selectedItems.length === 1 ? selectedItems[0] : null;

  return (
    <div className="panel panel--right">
      {singleItem && !singleItem.locked && <AlignmentControls item={singleItem} />}
      {partItem && SUB_PART_VARIANTS.has(ELEMENT_TYPES[partItem.type].variant) ? (
        <PartProperties item={partItem} part={selection.part.key} />
      ) : (
        <>
          {selectedItems.length > 0 && kinds.size === 1 && kinds.has('content') && (
            <ContentProperties items={selectedItems} />
          )}
          {selectedItems.length > 0 && kinds.size === 1 && kinds.has('shape') && (
            <ShapeProperties items={selectedItems} />
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
