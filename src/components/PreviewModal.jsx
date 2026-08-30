import React from 'react';
import EditorCanvas from './Canvas/EditorCanvas';

// The preview is deliberately just the SAME canvas tree in a modal — no
// separate render path, so there's no risk of preview drifting from what
// the editor actually shows. It's read-only by convention: we simply don't
// wire up click/drag intent messaging here beyond what EditorCanvas already
// does, and interacting with it edits the same live template, which is fine
// since closing the modal returns to the identical state.
export default function PreviewModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <button className="modal-close" onClick={onClose}>Close preview ✕</button>
      <div onClick={(e) => e.stopPropagation()} style={{ transform: 'scale(0.85)' }}>
        <EditorCanvas />
      </div>
    </div>
  );
}
