import React from 'react';
import { useEditor } from '../../state/EditorContext';
import CanvasLayer from './CanvasLayer';

// `readOnly` is how PreviewModal reuses this exact tree without leaking the
// live editor's selection into it: Preview shares the SAME EditorContext
// (deliberately — no separate render path to drift from what's actually on
// the page), so without this flag, whatever's selected behind the modal
// would still show its outline/handles/guides inside the "clean" preview.
export default function EditorCanvas({ readOnly = false }) {
  const { template, setSelection, edgeHighlight } = useEditor();

  return (
    <div className="canvas-scroll">
      <div
        className="page-frame"
        style={{ background: template.page.backgroundColor }}
        onMouseDown={readOnly ? undefined : () => setSelection({ ids: [], part: null })}
      >
        <CanvasLayer readOnly={readOnly} />
        {!readOnly && edgeHighlight?.top && <div className="page-edge-glow page-edge-glow--top" />}
        {!readOnly && edgeHighlight?.bottom && <div className="page-edge-glow page-edge-glow--bottom" />}
        {!readOnly && edgeHighlight?.left && <div className="page-edge-glow page-edge-glow--left" />}
        {!readOnly && edgeHighlight?.right && <div className="page-edge-glow page-edge-glow--right" />}
      </div>
    </div>
  );
}
