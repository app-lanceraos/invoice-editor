import React, { useState } from 'react';
import { useEditor } from '../../state/EditorContext';
import { detectRail } from '../../data/shapeCatalog';
import ShapeElement from './ShapeElement';

export default function DecorationLayer() {
  const { template, selection, setSelection } = useEditor();
  const [marquee, setMarquee] = useState(null); // {x,y,w,h} while dragging on empty canvas

  const startMarquee = (e) => {
    if (e.target !== e.currentTarget) return; // only start on empty canvas, not on a shape
    const rect = e.currentTarget.getBoundingClientRect();
    const start = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setSelection({ type: null, ids: [] });

    const onMove = (ev) => {
      const cur = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      const box = {
        x: Math.min(start.x, cur.x),
        y: Math.min(start.y, cur.y),
        w: Math.abs(cur.x - start.x),
        h: Math.abs(cur.y - start.y),
      };
      setMarquee(box);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setMarquee((box) => {
        if (box) {
          const hits = template.shapes.filter((s) => {
            return s.x < box.x + box.w && s.x + s.width > box.x && s.y < box.y + box.h && s.y + s.height > box.y;
          });
          if (hits.length) setSelection({ type: 'shape', ids: hits.map((s) => s.id) });
        }
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Live rail preview: while a selected shape is near an edge, show the
  // dashed content-safe-area indicator (approximated from committed shape
  // state — good enough since rail recognition only matters once released).
  const rails = template.shapes
    .map((s) => ({ shape: s, rail: detectRail(s, template.page) }))
    .filter((r) => r.rail && selection.ids.includes(r.shape.id));

  return (
    <div className="decoration-layer" onMouseDown={startMarquee}>
      {template.shapes.map((shape) => (
        <ShapeElement key={shape.id} shape={shape} />
      ))}

      {rails.map(({ shape, rail }) => (
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

      {marquee && (
        <div
          className="rail-overlay"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, borderStyle: 'solid' }}
        />
      )}
    </div>
  );
}
