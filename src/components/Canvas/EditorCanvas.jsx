import React from 'react';
import { useEditor } from '../../state/EditorContext';
import CanvasLayer from './CanvasLayer';

export default function EditorCanvas() {
  const { template, setSelection, edgeHighlight } = useEditor();

  return (
    <div className="canvas-scroll">
      <div
        className="page-frame"
        style={{ background: template.page.backgroundColor }}
        onMouseDown={() => setSelection({ ids: [], part: null })}
      >
        <CanvasLayer />
        {edgeHighlight?.top && <div className="page-edge-glow page-edge-glow--top" />}
        {edgeHighlight?.bottom && <div className="page-edge-glow page-edge-glow--bottom" />}
        {edgeHighlight?.left && <div className="page-edge-glow page-edge-glow--left" />}
        {edgeHighlight?.right && <div className="page-edge-glow page-edge-glow--right" />}
      </div>
    </div>
  );
}
