import React, { useState } from 'react';
import { EditorProvider, useEditor } from './state/EditorContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Toolbar from './components/Toolbar/Toolbar';
import ElementLibraryPanel from './components/Panels/ElementLibraryPanel';
import ShapeLibraryPanel from './components/Panels/ShapeLibraryPanel';
import LayersPanel from './components/Panels/LayersPanel';
import PropertiesPanel from './components/Panels/PropertiesPanel';
import EditorCanvas from './components/Canvas/EditorCanvas';
import PreviewModal from './components/PreviewModal';
import ContextMenu from './components/ContextMenu';
import { ChevronLeftIcon, ChevronRightIcon } from './components/Icons';

const LEFT_WIDTH = 240;
const RIGHT_WIDTH = 280;
// Prompt 24 item 2: wide enough to fully contain the 22px toggle button
// plus a few px of breathing room on both sides when collapsed — the
// previous 24px was narrower than the button's own footprint, so the
// button spilled past the column's (and, for the right panel, the app's
// own outer) edge.
const RAIL_WIDTH = 32;

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
        {/* Prompt 24 item 1: the toggle sits inline in a small header row
            (label + icon-only button, normal flow — not a dedicated
            full-width strip, not absolutely positioned over the panel's
            own content) when expanded; collapsed, `.panel-wrap` just
            centers the lone button in the narrow rail — see item 2's own
            comment on why that's a distinct layout, not the same button
            re-positioned. */}
        <div className={`panel-wrap${leftPanelCollapsed ? ' panel-wrap--collapsed' : ''}`}>
          {leftPanelCollapsed ? (
            <button
              className="panel-toggle-btn"
              onClick={toggleLeftPanel}
              aria-label="Expand elements panel"
              title="Expand panel"
            >
              <ChevronRightIcon />
            </button>
          ) : (
            <>
              <div className="panel-header">
                <span className="panel-header__label">Elements</span>
                <button
                  className="panel-toggle-btn"
                  onClick={toggleLeftPanel}
                  aria-label="Collapse elements panel"
                  title="Collapse panel"
                >
                  <ChevronLeftIcon />
                </button>
              </div>
              <div className="panel">
                <ElementLibraryPanel />
                <div style={{ height: 1, background: 'var(--border-glass)', margin: '16px 0' }} />
                <ShapeLibraryPanel />
                <div style={{ height: 1, background: 'var(--border-glass)', margin: '16px 0' }} />
                <LayersPanel />
              </div>
            </>
          )}
        </div>
        <EditorCanvas />
        <div className={`panel-wrap panel-wrap--right${rightPanelCollapsed ? ' panel-wrap--collapsed' : ''}`}>
          {rightPanelCollapsed ? (
            <button
              className="panel-toggle-btn"
              onClick={toggleRightPanel}
              aria-label="Expand properties panel"
              title="Expand panel"
            >
              <ChevronLeftIcon />
            </button>
          ) : (
            <>
              <div className="panel-header">
                <span className="panel-header__label">Properties</span>
                <button
                  className="panel-toggle-btn"
                  onClick={toggleRightPanel}
                  aria-label="Collapse properties panel"
                  title="Collapse panel"
                >
                  <ChevronRightIcon />
                </button>
              </div>
              <PropertiesPanel />
            </>
          )}
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
