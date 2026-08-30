import React from 'react';
import { ELEMENT_TYPES } from '../../data/elementCatalog';
import { useEditor } from '../../state/EditorContext';

// Renders just the content-element toggle list (no outer .panel wrapper —
// this is composed into LeftPanel alongside the shape library). "On" means
// at least one instance of that type currently exists on the canvas;
// toggling off removes every instance (blocked for required types).
export default function ElementLibraryPanel() {
  const { template, toggleContentItem } = useEditor();

  return (
    <>
      <div className="panel__section-title">Invoice elements</div>
      {Object.entries(ELEMENT_TYPES).map(([type, def]) => {
        const isOn = template.items.some((i) => i.kind === 'content' && i.type === type);
        const isLocked = def.required;
        return (
          <div key={type} className={`lib-item${isLocked ? ' lib-item--locked' : ''}`}>
            <span>{def.label}{def.required ? ' *' : ''}</span>
            <div
              className={`lib-item__toggle${isOn ? ' lib-item__toggle--on' : ''}`}
              onClick={() => !isLocked && toggleContentItem(type)}
              title={isLocked ? 'Required — always included' : 'Toggle on/off'}
            >
              <div className="lib-item__toggle__dot" />
            </div>
          </div>
        );
      })}
    </>
  );
}
