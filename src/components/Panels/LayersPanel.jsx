import React, { useState } from 'react';
import { useEditor } from '../../state/EditorContext';
import { ELEMENT_TYPES } from '../../data/elementCatalog';
import { SHAPE_TYPES } from '../../data/shapeCatalog';

// Prompt 26 item 2: every item's display label — the catalog's own name
// for content (single-instance per type, so it's already unambiguous),
// disambiguated with a running number for shapes only, since a page can
// have several of the same shape type. Numbering is stable against the
// item's own position among same-type peers in `template.items` (back-
// to-front array order), not against however the panel currently
// displays them — reordering unrelated items never renumbers a shape.
function computeLabels(items) {
  const totalByType = {};
  items.forEach((item) => {
    if (item.kind === 'shape') totalByType[item.type] = (totalByType[item.type] || 0) + 1;
  });
  const runningByType = {};
  const labels = new Map();
  items.forEach((item) => {
    if (item.kind === 'shape') {
      const def = SHAPE_TYPES[item.type];
      runningByType[item.type] = (runningByType[item.type] || 0) + 1;
      labels.set(item.id, totalByType[item.type] > 1 ? `${def.label} ${runningByType[item.type]}` : def.label);
    } else {
      labels.set(item.id, ELEMENT_TYPES[item.type]?.label || item.type);
    }
  });
  return labels;
}

export default function LayersPanel() {
  const { template, selection, setSelection, moveSelectionZ, reorderItems, toggleItemLocked, toggleItemHidden, zOrderClamped } =
    useEditor();
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const labels = computeLabels(template.items);
  // Displayed front-most first (Prompt 26 item 2's own spec) — the
  // reverse of `template.items`' back-to-front storage/paint order.
  const frontFirst = [...template.items].reverse();

  const selectItem = (e, id) => {
    if (e.shiftKey) {
      setSelection((prev) => ({
        ids: prev.ids.includes(id) ? prev.ids.filter((x) => x !== id) : [...prev.ids, id],
        part: null,
      }));
    } else {
      setSelection({ ids: [id], part: null });
    }
  };

  // Drop `dragId` immediately before `targetId` in the FRONT-FIRST
  // display order, then hand the reversed (back-to-front) result to
  // EditorContext — which runs it through the same normalizeZOrder every
  // other reorder path uses, so a shape dropped above content clamps
  // back below it exactly the same way Bring to Front etc. already do.
  const handleDrop = (targetId) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const frontIds = frontFirst.map((i) => i.id);
    const withoutDragged = frontIds.filter((id) => id !== dragId);
    const targetIdx = withoutDragged.indexOf(targetId);
    withoutDragged.splice(targetIdx, 0, dragId);
    reorderItems([...withoutDragged].reverse());
    setDragId(null);
    setOverId(null);
  };

  return (
    <>
      <div className="panel__section-title">Layers</div>
      {zOrderClamped && (
        <p className="layers-clamp-hint">Shapes always render behind content — position clamped.</p>
      )}
      {frontFirst.length === 0 && <p className="empty-hint">Nothing on the canvas yet.</p>}
      <div className="layers-list">
        {frontFirst.map((item) => {
          const isSelected = selection.ids.includes(item.id);
          return (
            <div
              key={item.id}
              className={`layer-row${isSelected ? ' layer-row--selected' : ''}${overId === item.id ? ' layer-row--over' : ''}${item.hidden ? ' layer-row--hidden' : ''}`}
              draggable
              onDragStart={() => setDragId(item.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overId !== item.id) setOverId(item.id);
              }}
              onDragLeave={() => setOverId((prev) => (prev === item.id ? null : prev))}
              onDrop={() => handleDrop(item.id)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onClick={(e) => selectItem(e, item.id)}
              title={labels.get(item.id)}
            >
              <span className={`layer-row__kind layer-row__kind--${item.kind}`} aria-hidden="true" />
              <span className="layer-row__label">{labels.get(item.id)}</span>
              <button
                type="button"
                className="layer-row__icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItemHidden(item.id);
                }}
                aria-label={item.hidden ? 'Show layer' : 'Hide layer'}
                title={item.hidden ? 'Show' : 'Hide'}
              >
                {item.hidden ? '🙈' : '👁'}
              </button>
              <button
                type="button"
                className="layer-row__icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItemLocked(item.id);
                }}
                aria-label={item.locked ? 'Unlock layer' : 'Lock layer'}
                title={item.locked ? 'Unlock' : 'Lock'}
              >
                {item.locked ? '🔒' : '🔓'}
              </button>
            </div>
          );
        })}
      </div>
      {selection.ids.length > 0 && (
        <div className="align-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 10 }}>
          <button className="tbtn" onClick={() => moveSelectionZ(selection.ids, 'front')}>Bring to Front</button>
          <button className="tbtn" onClick={() => moveSelectionZ(selection.ids, 'forward')}>Bring Forward</button>
          <button className="tbtn" onClick={() => moveSelectionZ(selection.ids, 'backward')}>Send Backward</button>
          <button className="tbtn" onClick={() => moveSelectionZ(selection.ids, 'back')}>Send to Back</button>
        </div>
      )}
    </>
  );
}
