import React from 'react';
import { useEditor } from '../../state/EditorContext';
import { ELEMENT_TYPES } from '../../data/elementCatalog';

// Variants whose text is split into an independently-styleable title/body
// (see elementStyles[type].title / .body) — kept in sync with ContentElement.
const SUB_PART_VARIANTS = new Set(['block', 'qr']);

function PartProperties({ type, part }) {
  const { template, updateElementPartStyle } = useEditor();
  const partStyle = (template.elementStyles[type] && template.elementStyles[type][part]) || {};
  const defaultColor = part === 'title' ? '#a2896b' : '#55524a';

  return (
    <>
      <div className="panel__section-title">
        {ELEMENT_TYPES[type].label} — {part === 'title' ? 'Title' : 'Body'}
      </div>
      <div className="prop-row">
        <label>Text color</label>
        <input type="color" value={partStyle.textColor || defaultColor} onChange={(e) => updateElementPartStyle(type, part, { textColor: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>Background</label>
        <input type="color" value={partStyle.bgColor || '#faf9f6'} onChange={(e) => updateElementPartStyle(type, part, { bgColor: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>Border color</label>
        <input type="color" value={partStyle.borderColor || '#262420'} onChange={(e) => updateElementPartStyle(type, part, { borderColor: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>Border width</label>
        <input type="range" min="0" max="6" value={partStyle.borderWidth || 0} onChange={(e) => updateElementPartStyle(type, part, { borderWidth: Number(e.target.value) })} />
      </div>
    </>
  );
}

function ContentProperties({ types, part }) {
  const { template, bulkUpdateElements } = useEditor();

  if (part && types.length === 1 && SUB_PART_VARIANTS.has(ELEMENT_TYPES[types[0]].variant)) {
    return <PartProperties type={types[0]} part={part} />;
  }

  const first = template.elementStyles[types[0]] || {};
  const hideTextColor = types.length === 1 && SUB_PART_VARIANTS.has(ELEMENT_TYPES[types[0]].variant);

  return (
    <>
      <div className="panel__section-title">
        {types.length > 1 ? `${types.length} elements selected` : ELEMENT_TYPES[types[0]].label}
      </div>
      {!hideTextColor && (
        <div className="prop-row">
          <label>Text color</label>
          <input type="color" value={first.textColor || '#262420'} onChange={(e) => bulkUpdateElements(types, { textColor: e.target.value })} />
        </div>
      )}
      <div className="prop-row">
        <label>Background</label>
        <input type="color" value={first.bgColor || '#faf9f6'} onChange={(e) => bulkUpdateElements(types, { bgColor: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>Border color</label>
        <input type="color" value={first.borderColor || '#262420'} onChange={(e) => bulkUpdateElements(types, { borderColor: e.target.value })} />
      </div>
      <div className="prop-row">
        <label>Border width</label>
        <input type="range" min="0" max="6" value={first.borderWidth || 0} onChange={(e) => bulkUpdateElements(types, { borderWidth: Number(e.target.value) })} />
      </div>
    </>
  );
}

function ShapeProperties({ ids }) {
  const { template, updateShapes } = useEditor();
  const shapes = template.shapes.filter((s) => ids.includes(s.id));
  const first = shapes[0];
  if (!first) return null;

  return (
    <>
      <div className="panel__section-title">{ids.length > 1 ? `${ids.length} shapes selected` : 'Shape'}</div>
      <div className="prop-row">
        <label>Fill</label>
        <input type="color" value={first.fill} onChange={(e) => updateShapes(ids, () => ({ fill: e.target.value }))} />
      </div>
      <div className="prop-row">
        <label>Border color</label>
        <input type="color" value={first.borderColor === 'transparent' ? '#000000' : first.borderColor} onChange={(e) => updateShapes(ids, () => ({ borderColor: e.target.value }))} />
      </div>
      <div className="prop-row">
        <label>Border width</label>
        <input type="range" min="0" max="8" value={first.borderWidth} onChange={(e) => updateShapes(ids, () => ({ borderWidth: Number(e.target.value) }))} />
      </div>
      {first.type === 'roundedRect' && (
        <div className="prop-row">
          <label>Corner radius</label>
          <input type="range" min="0" max="60" value={first.radius} onChange={(e) => updateShapes(ids, () => ({ radius: Number(e.target.value) }))} />
        </div>
      )}
      <div className="prop-row">
        <label>Width</label>
        <input type="number" value={Math.round(first.width)} onChange={(e) => updateShapes(ids, () => ({ width: Number(e.target.value) }))} />
      </div>
      <div className="prop-row">
        <label>Height</label>
        <input type="number" value={Math.round(first.height)} onChange={(e) => updateShapes(ids, () => ({ height: Number(e.target.value) }))} />
      </div>
      <div className="prop-row">
        <label>Rotation</label>
        <input type="range" min="-180" max="180" value={first.rotation} onChange={(e) => updateShapes(ids, () => ({ rotation: Number(e.target.value) }))} />
      </div>
    </>
  );
}

export default function PropertiesPanel() {
  const { selection, saveState } = useEditor();

  return (
    <div className="panel panel--right">
      {selection.type === 'content' && selection.ids.length > 0 && <ContentProperties types={selection.ids} part={selection.part} />}
      {selection.type === 'shape' && selection.ids.length > 0 && <ShapeProperties ids={selection.ids} />}
      {!selection.type && (
        <p className="empty-hint">
          Select a content element or shape on the canvas to edit its style here.
        </p>
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
