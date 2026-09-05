import React from 'react';
import { SHAPE_TYPES } from '../../data/shapeCatalog';
import { useEditor } from '../../state/EditorContext';

const SWATCH_CLASS = {
  roundedRect: 'shape-swatch shape-swatch--rect',
  ellipse: 'shape-swatch shape-swatch--ellipse',
  line: 'shape-swatch shape-swatch--line',
};

export default function ShapeLibraryPanel() {
  const { addShape } = useEditor();

  return (
    <>
      <div className="panel__section-title">Design shapes</div>
      {Object.entries(SHAPE_TYPES).map(([type, def]) => (
        <button key={type} className="shape-btn" onClick={() => addShape(type)}>
          <span className={SWATCH_CLASS[type]} />
          {def.label}
        </button>
      ))}
    </>
  );
}
