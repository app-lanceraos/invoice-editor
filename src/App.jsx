import React, { useState } from 'react';
import { EditorProvider } from './state/EditorContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Toolbar from './components/Toolbar/Toolbar';
import ElementLibraryPanel from './components/Panels/ElementLibraryPanel';
import ShapeLibraryPanel from './components/Panels/ShapeLibraryPanel';
import PropertiesPanel from './components/Panels/PropertiesPanel';
import EditorCanvas from './components/Canvas/EditorCanvas';
import PreviewModal from './components/PreviewModal';
import ContextMenu from './components/ContextMenu';

function EditorShell() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const togglePreview = () => setPreviewOpen((v) => !v);
  useKeyboardShortcuts({ onPreviewToggle: togglePreview });

  return (
    <div className="app-shell">
      <Toolbar onPreview={togglePreview} />
      <div className="workspace">
        <div className="panel">
          <ElementLibraryPanel />
          <div style={{ height: 1, background: 'var(--border-glass)', margin: '16px 0' }} />
          <ShapeLibraryPanel />
        </div>
        <EditorCanvas />
        <PropertiesPanel />
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
