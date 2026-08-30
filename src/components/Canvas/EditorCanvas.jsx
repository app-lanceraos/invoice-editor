import React from 'react';
import { useEditor } from '../../state/EditorContext';
import DecorationLayer from './DecorationLayer';
import ContentZone from './ContentZone';

export default function EditorCanvas() {
  const { railInsets, setSelection } = useEditor();

  return (
    <div className="canvas-scroll">
      <div className="page-frame" onMouseDown={() => setSelection({ type: null, ids: [] })}>
        <DecorationLayer />
        <div
          className="content-safe-area"
          style={{
            paddingTop: 32 + railInsets.top,
            paddingBottom: 32 + railInsets.bottom,
            paddingLeft: 32 + railInsets.left,
            paddingRight: 32 + railInsets.right,
          }}
        >
          <ContentZone region="header" />
          <ContentZone region="party" />
          <ContentZone region="table" />
          <ContentZone region="totals" />
          <ContentZone region="lower" />
          <ContentZone region="signRow" />
          <ContentZone region="footer" />
        </div>
      </div>
    </div>
  );
}
