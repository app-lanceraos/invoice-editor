import React from 'react';
import { useEditor } from '../../state/EditorContext';
import CanvasLayer from './CanvasLayer';

export default function EditorCanvas() {
  const { setSelection } = useEditor();

  return (
    <div className="canvas-scroll">
      <div className="page-frame" onMouseDown={() => setSelection({ ids: [], part: null })}>
        <CanvasLayer />
      </div>
    </div>
  );
}
