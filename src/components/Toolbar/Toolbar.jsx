import React from 'react';
import { useEditor } from '../../state/EditorContext';
import { LogoSVG, WordmarkSVG } from '../Brand';

export default function Toolbar({ onPreview }) {
  const {
    canUndo, canRedo, undo, redo, runSave,
    selection, deleteShapes, duplicateShapes, groupShapes,
    bulkDeleteOptionalElements,
  } = useEditor();

  const shapeSelected = selection.type === 'shape' && selection.ids.length > 0;
  const contentSelected = selection.type === 'content' && selection.ids.length > 0;
  const canGroup = shapeSelected && selection.ids.length >= 2;

  const handleDelete = () => {
    if (shapeSelected) deleteShapes(selection.ids);
    if (contentSelected) bulkDeleteOptionalElements(selection.ids);
  };

  return (
    <div className="toolbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
        <LogoSVG size={22} />
        <WordmarkSVG width={107} height={16} />
      </div>

      <button className="tbtn" disabled={!canUndo} onClick={undo}>
        Undo <span className="tbtn__key">⌘Z</span>
      </button>
      <button className="tbtn" disabled={!canRedo} onClick={redo}>
        Redo <span className="tbtn__key">⌘Y</span>
      </button>

      <button className="tbtn" disabled={!canGroup} onClick={() => groupShapes(selection.ids)}>
        Group <span className="tbtn__key">⌘G</span>
      </button>

      <button className="tbtn" disabled={!shapeSelected} onClick={() => duplicateShapes(selection.ids)}>
        Duplicate <span className="tbtn__key">⌘D</span>
      </button>

      <button className="tbtn" disabled={!shapeSelected && !contentSelected} onClick={handleDelete}>
        Delete <span className="tbtn__key">Del</span>
      </button>

      <div className="toolbar__spacer" />

      <button className="tbtn" onClick={onPreview}>Preview</button>
      <button className="tbtn tbtn--primary" onClick={runSave}>
        Save <span className="tbtn__key" style={{ borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.8)' }}>⌘S</span>
      </button>
    </div>
  );
}
