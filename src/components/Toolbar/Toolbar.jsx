import React from 'react';
import { useEditor } from '../../state/EditorContext';
import { LogoSVG, WordmarkSVG } from '../Brand';

export default function Toolbar({ onPreview }) {
  const {
    canUndo, canRedo, undo, redo, runSave,
    template, selection, deleteItems, deleteBlockLine, duplicateItems, groupItems,
  } = useEditor();

  const hasSelection = selection.ids.length > 0;
  const canGroup = selection.ids.length >= 2;
  // Prompt 21 item 2: content items are single-instance and can't be
  // duplicated — reflect that in the button's own enabled state (rather
  // than leaving it clickable-but-a-no-op) the same way ContextMenu's
  // equivalent check does; a mixed shape+content selection still enables
  // it, since duplicateItems already only acts on the shape(s) in it.
  const canDuplicate = selection.ids.some((id) => {
    const item = template.items.find((i) => i.id === id);
    return item && item.kind === 'shape' && !item.locked;
  });

  const handleDelete = () => {
    if (selection.part && selection.ids.length === 1) {
      deleteBlockLine(selection.ids[0], selection.part.key);
    } else {
      deleteItems(selection.ids);
    }
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

      <button className="tbtn" disabled={!canGroup} onClick={() => groupItems(selection.ids)}>
        Group <span className="tbtn__key">⌘G</span>
      </button>

      <button className="tbtn" disabled={!canDuplicate} onClick={() => duplicateItems(selection.ids)}>
        Duplicate <span className="tbtn__key">⌘D</span>
      </button>

      <button className="tbtn" disabled={!hasSelection} onClick={handleDelete}>
        Delete <span className="tbtn__key">Del</span>
      </button>

      <div className="toolbar__spacer" />

      <button className="tbtn" onClick={onPreview}>
        Preview <span className="tbtn__key">P</span>
      </button>
      <button className="tbtn tbtn--primary" onClick={runSave}>
        Save <span className="tbtn__key" style={{ borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.8)' }}>⌘S</span>
      </button>
    </div>
  );
}
