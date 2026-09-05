import React, { useState } from 'react';
import { EditorProvider, useEditor } from './state/EditorContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Toolbar from './components/Toolbar/Toolbar';
import ElementLibraryPanel from './components/Panels/ElementLibraryPanel';
import ShapeLibraryPanel from './components/Panels/ShapeLibraryPanel';
import PropertiesPanel from './components/Panels/PropertiesPanel';
import EditorCanvas from './components/Canvas/EditorCanvas';
import PreviewModal from './components/PreviewModal';
import ContextMenu from './components/ContextMenu';

const LEFT_WIDTH = 240;
const RIGHT_WIDTH = 280;
const RAIL_WIDTH = 24;

function EditorShell() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const togglePreview = () => setPreviewOpen((v) => !v);
  useKeyboardShortcuts({ onPreviewToggle: togglePreview });

  const { leftPanelCollapsed, toggleLeftPanel, rightPanelCollapsed, toggleRightPanel } = useEditor();

  return (
    <div className="app-shell">
      <Toolbar onPreview={togglePreview} />
      <div
        className="workspace"
        style={{
          gridTemplateColumns: `${leftPanelCollapsed ? RAIL_WIDTH : LEFT_WIDTH}px 1fr ${rightPanelCollapsed ? RAIL_WIDTH : RIGHT_WIDTH}px`,
        }}
      >
        <div className="panel-wrap">
          <button
            className="panel-rail__btn"
            onClick={toggleLeftPanel}
            aria-label={leftPanelCollapsed ? 'Expand elements panel' : 'Collapse elements panel'}
            title={leftPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {leftPanelCollapsed ? '▶' : '◀'}
          </button>
          {!leftPanelCollapsed && (
            <div className="panel">
              <ElementLibraryPanel />
              <div style={{ height: 1, background: 'var(--border-glass)', margin: '16px 0' }} />
              <ShapeLibraryPanel />
            </div>
          )}
        </div>
        <EditorCanvas />
        <div className="panel-wrap panel-wrap--right">
          <button
            className="panel-rail__btn"
            onClick={toggleRightPanel}
            aria-label={rightPanelCollapsed ? 'Expand properties panel' : 'Collapse properties panel'}
            title={rightPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {rightPanelCollapsed ? '◀' : '▶'}
          </button>
          {!rightPanelCollapsed && <PropertiesPanel />}
        </div>
      </div>
      {previewOpen && <PreviewModal onClose={() => setPreviewOpen(false)} />}
      <ContextMenu />
    </div>
  );
}

export default function App() {
  return (
    <EditorProvider>
      <EditorShell />
    </EditorProvider>
  );
}
