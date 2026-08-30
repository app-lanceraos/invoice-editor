import React from 'react';
import { useEditor } from '../../state/EditorContext';
import { ELEMENT_TYPES } from '../../data/elementCatalog';

// Variants whose text is split into an independently-styleable title/body
// (see item.title / item.body) — kept in sync with CanvasItem.
const SUB_PART_VARIANTS = new Set(['block', 'qr']);

function PartProperties({ item, part }) {
  const { updateItemPart } = useEditor();
  const partStyle = item[part] || {};
  const defaultColor = part === 'title' ? '#a2896b' : '#55524a';

  return (
    <>
      <div className="panel__section-title">
        {ELEMENT_TYPES[item.type].label} — {part === 'title' ? 'Title' : 'Body'}
      </div>
      <div className="prop-row">
        <label>Text color</label>
        <input type="color" value={partStyle.textColor || defaultColor} onChange={(e) => updateItemPart(item.id, part, { textColor: e.target.value })} />
      </div>
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
    </>
  );
}

function ContentProperties({ items }) {
  const { updateItems } = useEditor();
  const ids = items.map((i) => i.id);
  const first = items[0];
  const hideTextColor = items.length === 1 && SUB_PART_VARIANTS.has(ELEMENT_TYPES[first.type].variant);

  return (
    <>
      <div className="panel__section-title">
        {items.length > 1 ? `${items.length} elements selected` : ELEMENT_TYPES[first.type].label}
      </div>
      {!hideTextColor && (
        <div className="prop-row">
          <label>Text color</label>
          <input type="color" value={first.textColor || '#262420'} onChange={(e) => updateItems(ids, () => ({ textColor: e.target.value }))} />
        </div>
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

  return (
    <div className="panel panel--right">
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
