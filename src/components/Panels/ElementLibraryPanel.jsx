import React from 'react';
import { REGIONS, elementsForRegion } from '../../data/elementCatalog';
import { useEditor } from '../../state/EditorContext';

// Renders just the content-element toggle list (no outer .panel wrapper —
// this is composed into LeftPanel alongside the shape library).
export default function ElementLibraryPanel() {
  const { template, toggleElement } = useEditor();

  return (
    <>
      <div className="panel__section-title">Invoice elements</div>
      {Object.keys(REGIONS).map((region) => {
        const items = elementsForRegion(region);
        if (!items.length) return null;
        return (
          <div key={region}>
            <div className="panel__section-title">{REGIONS[region].label}</div>
            {items.map((item) => {
              const isOn = (template.slots[region] || []).includes(item.type);
              const isLocked = item.required || item.locked;
              return (
                <div key={item.type} className={`lib-item${isLocked ? ' lib-item--locked' : ''}`}>
                  <span>{item.label}{item.required ? ' *' : ''}</span>
                  <div
                    className={`lib-item__toggle${isOn ? ' lib-item__toggle--on' : ''}`}
                    onClick={() => !isLocked && toggleElement(item.type)}
                    title={isLocked ? 'Required — always included' : 'Toggle on/off'}
                  >
                    <div className="lib-item__toggle__dot" />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
