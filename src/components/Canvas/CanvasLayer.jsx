import React, { useState } from 'react';
import { useEditor } from '../../state/EditorContext';
import { detectRail } from '../../data/shapeCatalog';
import { beginDragSelectGuard } from '../../utils/dragGuard';
import CanvasItem from './CanvasItem';

// Single free-positioning canvas for every item — shape or content. Shapes
// still paint as background decoration: the shape group is painted first,
// the content group after, so content always sits visually above shapes
// regardless of where either sits in the underlying flat `template.items`
// array (which only orders items relative to their own kind-group).
export default function CanvasLayer({ readOnly = false }) {
  const { template, selection, setSelection, guides } = useEditor();
  const [marquee, setMarquee] = useState(null); // {x,y,w,h} while dragging on empty canvas

  const shapes = template.items.filter((i) => i.kind === 'shape');
  const contentItems = template.items.filter((i) => i.kind === 'content');

  const startMarquee = (e) => {
    if (e.target !== e.currentTarget) return; // only start on empty canvas, not on an item
    const restoreSelection = beginDragSelectGuard();
    const rect = e.currentTarget.getBoundingClientRect();
    const start = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setSelection({ ids: [], part: null });

    let currentBox = null; // tracked locally, not via React state, so onUp can
    // read the final box synchronously instead of nesting a cross-component
    // setSelection call inside setMarquee's own updater function.

    const onMove = (ev) => {
      const cur = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      currentBox = {
        x: Math.min(start.x, cur.x),
        y: Math.min(start.y, cur.y),
        w: Math.abs(cur.x - start.x),
        h: Math.abs(cur.y - start.y),
      };
      setMarquee(currentBox);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (currentBox) {
        const hits = template.items.filter((i) => {
          return (
            i.x < currentBox.x + currentBox.w &&
            i.x + i.width > currentBox.x &&
            i.y < currentBox.y + currentBox.h &&
            i.y + i.height > currentBox.y
          );
        });
        if (hits.length) setSelection({ ids: hits.map((i) => i.id), part: null });
      }
      setMarquee(null);
      restoreSelection();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Live rail preview: while a selected shape is near an edge, show the
  // dashed safe-area indicator (approximated from committed shape state —
  // good enough since rail recognition only matters once released).
  const rails = !readOnly && shapes
    .map((shape) => ({ shape, rail: detectRail(shape, template.page) }))
    .filter((r) => r.rail && selection.ids.includes(r.shape.id));

  return (
    <div className="canvas-layer" onMouseDown={readOnly ? undefined : startMarquee}>
      {shapes.map((item) => (
        <CanvasItem key={item.id} item={item} readOnly={readOnly} />
      ))}
      {contentItems.map((item) => (
        <CanvasItem key={item.id} item={item} readOnly={readOnly} />
      ))}

      {!readOnly && rails.map(({ shape, rail }) => (
        <div
          key={shape.id}
          className="rail-overlay"
          style={{
            left: rail.edge === 'right' ? undefined : rail.edge === 'left' ? rail.thickness : 0,
            right: rail.edge === 'right' ? rail.thickness : rail.edge === 'left' ? undefined : 0,
            top: rail.edge === 'bottom' ? undefined : rail.edge === 'top' ? rail.thickness : 0,
            bottom: rail.edge === 'bottom' ? rail.thickness : rail.edge === 'top' ? undefined : 0,
          }}
        />
      ))}

      {!readOnly && marquee && (
        <div
          className="rail-overlay"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, borderStyle: 'solid' }}
        />
      )}

      {/* Smart guides: transient, only while a drag/resize gesture is
          active (see CanvasItem's computeGuides use) — full-span alignment
          lines plus live distance labels to nearby items. Explicitly gated
          on readOnly too, not just left to "guides is null outside a
          drag" — Preview must never show them even if a gesture somehow
          left stale guide state behind in the shared context. */}
      {!readOnly && guides?.vertical.map((x) => (
        <div key={`gv-${x}`} className="align-guide align-guide--vertical" style={{ left: x }} />
      ))}
      {!readOnly && guides?.horizontal.map((y) => (
        <div key={`gh-${y}`} className="align-guide align-guide--horizontal" style={{ top: y }} />
      ))}
      {!readOnly && guides?.labels.map((l, i) => (
        <div key={i} className="align-guide-label" style={{ left: l.x, top: l.y }}>{l.text}</div>
      ))}
    </div>
  );
}
