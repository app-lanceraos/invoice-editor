import React, { useState } from 'react';
import { useEditor } from '../../state/EditorContext';
import { snapRotation } from '../../utils/geometry';

// IMPORTANT: dragging/resizing/rotating must produce exactly ONE undo step
// per gesture (agreed in the spec). So while the mouse is down we only
// update *local* preview state — nothing touches history. The single
// `updateShape` commit fires once, on mouseup, with the final values.

export default function ShapeElement({ shape }) {
  const { selection, setSelection, updateShape } = useEditor();
  const isSelected = selection.type === 'shape' && selection.ids.includes(shape.id);
  const [live, setLive] = useState(null); // { x, y, width, height, rotation } while dragging
  const [rotationSnapped, setRotationSnapped] = useState(false);

  const current = { ...shape, ...(live || {}) };

  const shapeStyle = {
    left: current.x,
    top: current.y,
    width: current.width,
    height: current.height,
    background: shape.fill,
    border: shape.borderWidth ? `${shape.borderWidth}px solid ${shape.borderColor}` : 'none',
    borderRadius: shape.type === 'ellipse' ? '50%' : shape.type === 'line' ? current.height / 2 : shape.radius,
    transform: `rotate(${current.rotation}deg)`,
  };

  const beginMove = (e) => {
    e.stopPropagation();
    if (e.shiftKey && selection.type === 'shape') {
      const ids = selection.ids.includes(shape.id)
        ? selection.ids.filter((id) => id !== shape.id)
        : [...selection.ids, shape.id];
      setSelection({ type: 'shape', ids });
    } else if (!isSelected) {
      setSelection({ type: 'shape', ids: [shape.id] });
    }

    const start = { x: e.clientX, y: e.clientY, origX: shape.x, origY: shape.y };
    let finalPos = null;

    const onMove = (ev) => {
      finalPos = { x: start.origX + (ev.clientX - start.x), y: start.origY + (ev.clientY - start.y) };
      setLive(finalPos);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalPos) updateShape(shape.id, finalPos); // single history commit
      setLive(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const beginResize = (e) => {
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, w: shape.width, h: shape.height };
    let finalSize = null;

    const onMove = (ev) => {
      finalSize = {
        width: Math.max(16, start.w + (ev.clientX - start.x)),
        height: Math.max(shape.type === 'line' ? 2 : 16, start.h + (ev.clientY - start.y)),
      };
      setLive(finalSize);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalSize) updateShape(shape.id, finalSize);
      setLive(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const beginRotate = (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let finalRotation = null;

    const onMove = (ev) => {
      const raw = Math.round((Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90);
      const { value, snapped } = snapRotation(raw);
      finalRotation = { rotation: value };
      setRotationSnapped(snapped);
      setLive(finalRotation);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalRotation) updateShape(shape.id, finalRotation);
      setLive(null);
      setRotationSnapped(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className={`shape-el${isSelected ? ' shape-el--selected' : ''}`}
      style={shapeStyle}
      onMouseDown={beginMove}
    >
      {isSelected && (
        <>
          <div className="shape-el__resize-handle" onMouseDown={beginResize} />
          <div
            className={`shape-el__rotate-handle${rotationSnapped ? ' shape-el__rotate-handle--snapped' : ''}`}
            onMouseDown={beginRotate}
          />
        </>
      )}
    </div>
  );
}
